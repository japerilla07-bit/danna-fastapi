"""
Bitácora routes — jornadas del usuario (plan + cierre por sesión)
==================================================================
    GET  /api/bitacora/jornadas                      — lista de mis jornadas (más recientes primero)
    GET  /api/bitacora/jornadas/{fecha}              — una jornada (404 si no existe)
    POST /api/bitacora/jornadas/{fecha}              — guardar (versión optimista; 409 si hay conflicto)
    GET  /api/bitacora/jornadas/{fecha}/historial    — versiones guardadas de esa jornada

Reglas:
  - Cada usuario solo accede a SUS jornadas (el user_id sale de la sesión, nunca del cliente).
  - No toca el motor ni las sesiones de juego.
  - Acceso: usuario autenticado con cuenta ACTIVA. A propósito NO se exige plan vigente
    ni spins: el cierre del día se llena al final, cuando un pase de 24 h o un trial
    pueden haberse agotado, y no debe perder su propio registro por eso.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import STATUS_ACTIVE
from core.auth_helpers import require_authenticated_user
from core import bitacora_store as store

log = logging.getLogger("bitacora_routes")
router = APIRouter(prefix="/api/bitacora", tags=["bitacora"])


def usuario_bitacora(user: dict = Depends(require_authenticated_user)) -> dict:
    if user.get("status") != STATUS_ACTIVE:
        raise HTTPException(status_code=403, detail="Cuenta no activa.")
    return user


class GuardarJornada(BaseModel):
    base_version: int = Field(..., ge=0, description="Versión que el cliente conocía (0 = jornada nueva)")
    doc: dict[str, Any]
    forzar: bool = Field(False, description="True solo si el usuario eligió sobrescribir tras un conflicto")


def _422(e: store.ErrorBitacora):
    raise HTTPException(status_code=422, detail=str(e))


@router.get("/jornadas")
def listar_jornadas(user: dict = Depends(usuario_bitacora)):
    try:
        return {"jornadas": store.listar(user["username"])}
    except store.ErrorBitacora as e:
        _422(e)


@router.get("/jornadas/{fecha}")
def leer_jornada(fecha: str, user: dict = Depends(usuario_bitacora)):
    try:
        j = store.leer(user["username"], fecha)
    except store.ErrorBitacora as e:
        _422(e)
    if j is None:
        raise HTTPException(status_code=404, detail="No hay jornada guardada para esa fecha.")
    return j


@router.post("/jornadas/{fecha}")
def guardar_jornada(fecha: str, req: GuardarJornada, user: dict = Depends(usuario_bitacora)):
    try:
        r = store.guardar(user["username"], fecha, req.doc, req.base_version, forzar=req.forzar)
    except store.Conflicto as c:
        return JSONResponse(status_code=409, content={"detail": "conflicto", "actual": c.actual})
    except store.ErrorBitacora as e:
        _422(e)
    log.info("Jornada %s guardada para '%s' (v%s)", fecha, user["username"], r["version"])
    return r


@router.get("/jornadas/{fecha}/historial")
def historial_jornada(fecha: str, user: dict = Depends(usuario_bitacora)):
    try:
        return {"fecha": fecha, "versiones": store.historial(user["username"], fecha)}
    except store.ErrorBitacora as e:
        _422(e)
