"""Pruebas del almacén y las rutas de la bitácora.
Uso (desde la raíz del repo):  python -m pytest backend_tests -q
Aíslan la base de datos en un directorio temporal y no tocan ninguna base real.
"""
import importlib
import json
import sqlite3
import sys
import threading
import types

import pytest


@pytest.fixture()
def entorno(tmp_path, monkeypatch):
    monkeypatch.setenv("DANNA_DATA_DIR", str(tmp_path))
    if "streamlit" not in sys.modules:  # auth.py lo importa pero no lo usa
        sys.modules["streamlit"] = types.ModuleType("streamlit")
    from core import bitacora_store
    importlib.reload(bitacora_store)
    return bitacora_store


def doc(n=1, extra=None):
    d = {"v": 2, "cfg": {"fecha": "2026-10-13"}, "ops": [], "registros": {"1": {"n": 1, "notas": f"nota {n}"}}}
    if extra:
        d.update(extra)
    return d


# ── almacén ─────────────────────────────────────────────────────────────
def test_crear_leer_actualizar(entorno):
    s = entorno
    assert s.leer("ana", "2026-10-13") is None
    r = s.guardar("ana", "2026-10-13", doc(1), 0)
    assert r["version"] == 1
    assert s.leer("ana", "2026-10-13")["doc"] == doc(1)
    r2 = s.guardar("ana", "2026-10-13", doc(2), 1)
    assert r2["version"] == 2 and s.leer("ana", "2026-10-13")["doc"] == doc(2)


def test_aislamiento_entre_usuarios(entorno):
    s = entorno
    s.guardar("ana", "2026-10-13", doc(1), 0)
    assert s.leer("beto", "2026-10-13") is None
    assert s.listar("beto") == []
    s.guardar("beto", "2026-10-13", doc(2), 0)  # misma fecha, otro usuario: es otra jornada
    assert s.leer("ana", "2026-10-13")["doc"] == doc(1)
    assert s.leer("beto", "2026-10-13")["doc"] == doc(2)
    assert [j["fecha"] for j in s.listar("ana")] == ["2026-10-13"]
    assert s.historial("beto", "2026-10-13")[0]["doc"] == doc(2)


def test_conflicto_no_pisa_en_silencio(entorno):
    s = entorno
    s.guardar("ana", "2026-10-13", doc(1), 0)
    s.guardar("ana", "2026-10-13", doc(2), 1)          # otra pantalla ya guardó la v2
    with pytest.raises(s.Conflicto) as c:
        s.guardar("ana", "2026-10-13", doc(3), 1)       # esta pantalla aún cree que va en la v1
    assert c.value.actual["version"] == 2 and c.value.actual["doc"] == doc(2)
    assert s.leer("ana", "2026-10-13")["doc"] == doc(2)  # nada cambió
    with pytest.raises(s.Conflicto):                     # jornada que "no existía" pero sí existe
        s.guardar("ana", "2026-10-13", doc(3), 0)


def test_forzar_sobrescribe_y_deja_rastro(entorno):
    s = entorno
    s.guardar("ana", "2026-10-13", doc(1), 0)
    s.guardar("ana", "2026-10-13", doc(2), 1)
    r = s.guardar("ana", "2026-10-13", doc(3), 1, forzar=True)
    assert r["version"] == 3
    assert [h["version"] for h in s.historial("ana", "2026-10-13")] == [3, 2, 1]
    assert s.historial("ana", "2026-10-13")[1]["doc"] == doc(2)  # lo sobrescrito sigue en el historial


def test_reintento_idempotente_no_duplica(entorno):
    s = entorno
    a = s.guardar("ana", "2026-10-13", doc(1), 0)
    b = s.guardar("ana", "2026-10-13", doc(1), 0)       # respuesta perdida → el cliente reintenta
    assert a["version"] == b["version"] == 1 and len(s.historial("ana", "2026-10-13")) == 1
    c = s.guardar("ana", "2026-10-13", doc(1), 1)       # guardar sin cambios
    assert c["version"] == 1
    s.guardar("ana", "2026-10-13", doc(2), 1)
    d = s.guardar("ana", "2026-10-13", doc(2), 1)       # reintento de la v2
    assert d["version"] == 2 and len(s.historial("ana", "2026-10-13")) == 2


def test_validaciones(entorno):
    s = entorno
    for f in ["2026-02-30", "26-10-13", "", "2026-13-01", "../etc", None, 5]:
        with pytest.raises(s.ErrorBitacora):
            s.guardar("ana", f, doc(), 0)
    for d in [None, [], "x", {}, {"cfg": {}, "ops": []}, {"cfg": 1, "ops": [], "registros": {}}, {"cfg": {}, "ops": {}, "registros": {}}]:
        with pytest.raises(s.ErrorBitacora):
            s.guardar("ana", "2026-10-13", d, 0)
    for bv in [-1, "1", None, True, 1.5]:
        with pytest.raises(s.ErrorBitacora):
            s.guardar("ana", "2026-10-13", doc(), bv)
    with pytest.raises(s.ErrorBitacora):
        s.guardar("ana", "2026-10-13", doc(extra={"x": float("nan")}), 0)
    with pytest.raises(s.ErrorBitacora):
        s.guardar("ana", "2026-10-13", doc(extra={"x": "a" * 300_000}), 0)
    for u in ["", "  ", None]:
        with pytest.raises(s.ErrorBitacora):
            s.leer(u, "2026-10-13")
    assert s.listar("ana") == []  # nada inválido se guardó


def test_inyeccion_sql_se_trata_como_texto(entorno):
    s = entorno
    malo = "x'; DROP TABLE jornadas; --"
    s.guardar(malo, "2026-10-13", doc(1), 0)
    assert s.leer(malo, "2026-10-13")["doc"] == doc(1)
    assert s.leer("ana", "2026-10-13") is None


def test_historial_se_poda(entorno):
    s = entorno
    v = 0
    for i in range(s.HISTORIAL_MAX + 7):
        v = s.guardar("ana", "2026-10-13", doc(i), v)["version"]
    h = s.historial("ana", "2026-10-13")
    assert len(h) == s.HISTORIAL_MAX and h[0]["version"] == v and h[-1]["version"] == v - s.HISTORIAL_MAX + 1


def test_lista_ordenada_y_acotada(entorno):
    s = entorno
    for f in ["2026-10-11", "2026-10-13", "2026-10-12"]:
        s.guardar("ana", f, doc(), 0)
    assert [j["fecha"] for j in s.listar("ana")] == ["2026-10-13", "2026-10-12", "2026-10-11"]
    assert len(s.listar("ana", 2)) == 2


def test_datos_sobreviven_al_reinicio(entorno, tmp_path):
    s = entorno
    s.guardar("ana", "2026-10-13", doc(1), 0)
    importlib.reload(s)  # simula reinicio del proceso (misma carpeta de datos)
    assert s.leer("ana", "2026-10-13")["doc"] == doc(1)
    assert (tmp_path / "danna_bitacora.db").exists()


def test_guardados_simultaneos_solo_uno_gana(entorno):
    s = entorno
    s.guardar("ana", "2026-10-13", doc(0), 0)
    resultados = []

    def intento(i):
        try:
            resultados.append(("ok", s.guardar("ana", "2026-10-13", doc(i + 10), 1)["version"]))
        except s.Conflicto:
            resultados.append(("conflicto", None))

    hilos = [threading.Thread(target=intento, args=(i,)) for i in range(8)]
    [h.start() for h in hilos]
    [h.join() for h in hilos]
    assert sum(1 for r in resultados if r[0] == "ok") == 1 and sum(1 for r in resultados if r[0] == "conflicto") == 7
    assert s.leer("ana", "2026-10-13")["version"] == 2


def test_no_toca_otras_bases(entorno, tmp_path):
    entorno.guardar("ana", "2026-10-13", doc(), 0)
    assert sorted(p.name for p in tmp_path.iterdir() if p.suffix == ".db") == ["danna_bitacora.db"]
    con = sqlite3.connect(str(tmp_path / "danna_bitacora.db"))
    assert {r[0] for r in con.execute("select name from sqlite_master where type='table'")} >= {"jornadas", "jornadas_historial"}


# ── rutas ───────────────────────────────────────────────────────────────
@pytest.fixture()
def cliente(entorno):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import api_v2.bitacora_routes as rutas
    importlib.reload(rutas)
    app = FastAPI()
    app.include_router(rutas.router)
    usuario = {"username": "ana", "status": "active"}
    app.dependency_overrides[rutas.require_authenticated_user] = lambda: usuario
    c = TestClient(app)
    c.usuario = usuario
    c.app_ref = app
    c.rutas = rutas
    return c


def test_ruta_ciclo_completo(cliente):
    assert cliente.get("/api/bitacora/jornadas/2026-10-13").status_code == 404
    r = cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc(1)})
    assert r.status_code == 200 and r.json()["version"] == 1
    g = cliente.get("/api/bitacora/jornadas/2026-10-13").json()
    assert g["doc"] == doc(1) and g["version"] == 1
    assert [j["fecha"] for j in cliente.get("/api/bitacora/jornadas").json()["jornadas"]] == ["2026-10-13"]
    assert len(cliente.get("/api/bitacora/jornadas/2026-10-13/historial").json()["versiones"]) == 1


def test_ruta_conflicto_409_con_lo_que_hay(cliente):
    cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc(1)})
    cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 1, "doc": doc(2)})
    r = cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 1, "doc": doc(3)})
    assert r.status_code == 409 and r.json()["actual"]["version"] == 2 and r.json()["actual"]["doc"] == doc(2)
    ok = cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 1, "doc": doc(3), "forzar": True})
    assert ok.status_code == 200 and ok.json()["version"] == 3


def test_ruta_validacion_422(cliente):
    assert cliente.get("/api/bitacora/jornadas/2026-02-30").status_code == 422
    assert cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": {"cfg": {}}}).status_code == 422
    assert cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": -1, "doc": doc()}).status_code == 422
    assert cliente.post("/api/bitacora/jornadas/2026-10-13", json={"doc": doc()}).status_code == 422


def test_ruta_usuario_sale_de_la_sesion_no_del_cliente(cliente):
    cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc(1), "user_id": "beto", "username": "beto"})
    cliente.usuario["username"] = "beto"
    assert cliente.get("/api/bitacora/jornadas/2026-10-13").status_code == 404  # beto no ve lo de ana
    assert cliente.get("/api/bitacora/jornadas").json()["jornadas"] == []


def test_ruta_cuenta_no_activa_403(cliente):
    cliente.usuario["status"] = "suspended"
    assert cliente.get("/api/bitacora/jornadas").status_code == 403
    assert cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc()}).status_code == 403
    cliente.usuario["status"] = "pending"
    assert cliente.get("/api/bitacora/jornadas/2026-10-13").status_code == 403


def test_ruta_plan_vencido_sigue_pudiendo_cerrar_su_dia(cliente):
    cliente.usuario.update({"status": "active", "plan": "daily_pass", "plan_expires": "2000-01-01"})
    assert cliente.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc()}).status_code == 200


def test_ruta_sin_sesion_401(entorno):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import api_v2.bitacora_routes as rutas
    importlib.reload(rutas)
    app = FastAPI(); app.include_router(rutas.router)
    c = TestClient(app)  # sin override ni cookie
    assert c.get("/api/bitacora/jornadas").status_code == 401
    assert c.post("/api/bitacora/jornadas/2026-10-13", json={"base_version": 0, "doc": doc()}).status_code == 401
