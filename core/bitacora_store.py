"""
Bitácora — almacén por usuario de las jornadas (plan + cierre de cada sesión).
==============================================================================

Principios:
  - La bitácora observa y registra; NO toca el motor ni las sesiones de juego
    (no importa session_manager ni engine). Archivo SQLite propio.
  - Cada usuario solo ve lo suyo: TODA consulta lleva el user_id.
  - Una jornada = un documento JSON por (usuario, fecha). El servidor lo guarda
    tal cual (lo sanea el frontend) pero valida forma básica y tamaño.
  - Concurrencia optimista: cada guardado indica la versión que el cliente
    conocía (base_version). Si no coincide con la del servidor → conflicto, y se
    devuelve lo que hay para que el usuario decida; nunca se pisa en silencio.
  - Reintento idempotente: si el cliente repite un guardado cuya respuesta se
    perdió (misma base_version e igual contenido), se responde OK sin duplicar.
  - Cada versión guardada queda en un historial (últimas HISTORIAL_MAX) como
    rastro de correcciones.

Archivo: DANNA_DATA_DIR/danna_bitacora.db (el volumen persistente de Railway).
"""

import json
import logging
import os
import re
import sqlite3
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger("bitacora_store")

HISTORIAL_MAX = 50
DOC_MAX_BYTES = 200_000
LISTA_MAX = 400
_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ErrorBitacora(Exception):
    """Entrada inválida (se traduce a 422)."""


class Conflicto(Exception):
    """La versión base no coincide con la guardada."""

    def __init__(self, actual: dict):
        super().__init__("conflicto de versión")
        self.actual = actual


def _db_path() -> Path:
    # Se resuelve en cada llamada: así respeta DANNA_DATA_DIR aunque cambie (pruebas).
    base = os.environ.get("DANNA_DATA_DIR")
    base_dir = Path(base) if base else Path(__file__).parent.parent
    return (base_dir / "danna_bitacora.db").resolve()


_lock = threading.Lock()
_listos: set[str] = set()


def _conectar() -> sqlite3.Connection:
    ruta = _db_path()
    conn = sqlite3.connect(str(ruta), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    if str(ruta) not in _listos:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS jornadas (
                   user_id TEXT NOT NULL,
                   fecha TEXT NOT NULL,
                   version INTEGER NOT NULL,
                   doc TEXT NOT NULL,
                   creado TEXT NOT NULL,
                   actualizado TEXT NOT NULL,
                   PRIMARY KEY (user_id, fecha)
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS jornadas_historial (
                   user_id TEXT NOT NULL,
                   fecha TEXT NOT NULL,
                   version INTEGER NOT NULL,
                   doc TEXT NOT NULL,
                   guardado_en TEXT NOT NULL,
                   PRIMARY KEY (user_id, fecha, version)
               )"""
        )
        _listos.add(str(ruta))
    return conn


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validar_fecha(fecha: Any) -> str:
    if not isinstance(fecha, str) or not _FECHA_RE.match(fecha):
        raise ErrorBitacora("Fecha inválida: usa el formato AAAA-MM-DD.")
    try:
        date.fromisoformat(fecha)
    except ValueError:
        raise ErrorBitacora("Fecha inválida: ese día no existe.")
    return fecha


def _validar_doc(doc: Any) -> str:
    if not isinstance(doc, dict):
        raise ErrorBitacora("El documento de la jornada debe ser un objeto.")
    if not isinstance(doc.get("cfg"), dict) or not isinstance(doc.get("ops"), list) or not isinstance(doc.get("registros"), dict):
        raise ErrorBitacora("Documento incompleto: faltan cfg, ops o registros.")
    try:
        txt = json.dumps(doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError):
        raise ErrorBitacora("El documento contiene valores que no se pueden guardar.")
    if len(txt.encode("utf-8")) > DOC_MAX_BYTES:
        raise ErrorBitacora("El documento es demasiado grande.")
    return txt


def _validar_usuario(user_id: Any) -> str:
    if not isinstance(user_id, str) or not user_id.strip():
        raise ErrorBitacora("Usuario inválido.")
    return user_id


def _fila_a_dict(fila: sqlite3.Row) -> dict:
    return {
        "fecha": fila["fecha"],
        "version": fila["version"],
        "actualizado": fila["actualizado"],
        "doc": json.loads(fila["doc"]),
    }


def leer(user_id: str, fecha: str) -> Optional[dict]:
    user_id = _validar_usuario(user_id)
    fecha = validar_fecha(fecha)
    with _lock:
        conn = _conectar()
        try:
            fila = conn.execute(
                "SELECT fecha, version, doc, actualizado FROM jornadas WHERE user_id=? AND fecha=?",
                (user_id, fecha),
            ).fetchone()
        finally:
            conn.close()
    return _fila_a_dict(fila) if fila else None


def listar(user_id: str, limite: int = LISTA_MAX) -> list[dict]:
    user_id = _validar_usuario(user_id)
    limite = max(1, min(int(limite), LISTA_MAX))
    with _lock:
        conn = _conectar()
        try:
            filas = conn.execute(
                "SELECT fecha, version, doc, actualizado FROM jornadas WHERE user_id=? ORDER BY fecha DESC LIMIT ?",
                (user_id, limite),
            ).fetchall()
        finally:
            conn.close()
    return [_fila_a_dict(f) for f in filas]


def historial(user_id: str, fecha: str) -> list[dict]:
    user_id = _validar_usuario(user_id)
    fecha = validar_fecha(fecha)
    with _lock:
        conn = _conectar()
        try:
            filas = conn.execute(
                "SELECT version, doc, guardado_en FROM jornadas_historial WHERE user_id=? AND fecha=? ORDER BY version DESC",
                (user_id, fecha),
            ).fetchall()
        finally:
            conn.close()
    return [{"version": f["version"], "guardado_en": f["guardado_en"], "doc": json.loads(f["doc"])} for f in filas]


def guardar(user_id: str, fecha: str, doc: Any, base_version: Any, forzar: bool = False) -> dict:
    """
    Guarda el documento de una jornada.

    base_version = 0  → el cliente cree que la jornada no existe todavía.
    base_version = N  → el cliente partió de la versión N.
    forzar=True       → el usuario eligió explícitamente sobrescribir tras un conflicto
                        (la versión nueva sigue la cadena; la anterior queda en el historial).

    Devuelve {fecha, version, actualizado}. Lanza Conflicto o ErrorBitacora.
    """
    user_id = _validar_usuario(user_id)
    fecha = validar_fecha(fecha)
    if isinstance(base_version, bool) or not isinstance(base_version, int) or base_version < 0:
        raise ErrorBitacora("base_version inválida.")
    txt = _validar_doc(doc)
    ahora = _ahora()

    with _lock:
        conn = _conectar()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                fila = conn.execute(
                    "SELECT fecha, version, doc, actualizado FROM jornadas WHERE user_id=? AND fecha=?",
                    (user_id, fecha),
                ).fetchone()
                actual_version = fila["version"] if fila else 0

                if fila is not None and fila["doc"] == txt and base_version in (actual_version, actual_version - 1):
                    # Reintento idempotente (o guardado sin cambios): no se crea otra versión.
                    conn.execute("ROLLBACK")
                    return {"fecha": fecha, "version": actual_version, "actualizado": fila["actualizado"]}

                if base_version != actual_version and not forzar:
                    conn.execute("ROLLBACK")
                    raise Conflicto(_fila_a_dict(fila) if fila else {"fecha": fecha, "version": 0, "actualizado": "", "doc": None})

                nueva = actual_version + 1
                if fila is None:
                    conn.execute(
                        "INSERT INTO jornadas (user_id, fecha, version, doc, creado, actualizado) VALUES (?,?,?,?,?,?)",
                        (user_id, fecha, nueva, txt, ahora, ahora),
                    )
                else:
                    conn.execute(
                        "UPDATE jornadas SET version=?, doc=?, actualizado=? WHERE user_id=? AND fecha=?",
                        (nueva, txt, ahora, user_id, fecha),
                    )
                conn.execute(
                    "INSERT INTO jornadas_historial (user_id, fecha, version, doc, guardado_en) VALUES (?,?,?,?,?)",
                    (user_id, fecha, nueva, txt, ahora),
                )
                conn.execute(
                    "DELETE FROM jornadas_historial WHERE user_id=? AND fecha=? AND version <= ?",
                    (user_id, fecha, nueva - HISTORIAL_MAX),
                )
                conn.execute("COMMIT")
            except Conflicto:
                raise
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
        finally:
            conn.close()
    return {"fecha": fecha, "version": nueva, "actualizado": ahora}
