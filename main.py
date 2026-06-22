"""
D.A.N.N.A. — Main backend (API + React)
========================================
Entry point del backend nuevo.

Filosofía:
  - Este proyecto NO contiene Streamlit. Es solo API + React.
  - El Streamlit viejo sigue corriendo en el repo Ml_engine_gunner_D.A.N.N.A
    para mantener a tus usuarios actuales hasta que React esté listo.
  - Cuando React esté listo, se cambia el DNS de dannaengine.com a este
    proyecto y se apaga el viejo.

Responsabilidades:
  1. Levanta FastAPI con todos los routers (api.py, api_v2/*).
  2. Sirve el build de React desde /frontend_dist (cuando exista).
  3. SPA fallback para react-router.

En producción:
    uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
"""

import os
import sys
import logging
import types
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ── Logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("main")

# ── Config ─────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.resolve()
FRONTEND_DIST = BASE_DIR / "frontend_dist"


# ── Stub de streamlit (auth.py lo importa pero no lo usa en API) ──
def _install_streamlit_stub_if_missing():
    """
    auth.py hace `import streamlit as st` para los formularios de login.
    Como este proyecto NO usa Streamlit, instalamos un stub mínimo.
    Las funciones CRUD (verify_user, create_user, etc.) NO usan st y
    siguen funcionando perfecto.
    """
    try:
        import streamlit  # noqa: F401
        return
    except ImportError:
        pass

    stub = types.ModuleType("streamlit")

    class _Dummy:
        def __getattr__(self, _n): return self
        def __call__(self, *a, **k): return self
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def __bool__(self): return False
        def __iter__(self): return iter([])

    _d = _Dummy()
    stub.session_state = {}
    for _name in (
        "markdown", "write", "error", "warning", "success", "info",
        "caption", "metric", "rerun", "stop",
    ):
        setattr(stub, _name, lambda *a, **k: None)
    stub.button = lambda *a, **k: False
    stub.text_input = lambda *a, **k: ""
    stub.text_area = lambda *a, **k: ""
    stub.selectbox = lambda *a, **k: None
    stub.number_input = lambda *a, **k: 0
    stub.radio = lambda *a, **k: None
    stub.tabs = lambda labels: tuple(_d for _ in labels)
    stub.columns = lambda spec: tuple(
        _d for _ in (spec if isinstance(spec, (list, tuple)) else range(spec))
    )
    stub.expander = lambda *a, **k: _d
    sys.modules["streamlit"] = stub
    log.info("Stub de Streamlit instalado (no requerido para API)")


_install_streamlit_stub_if_missing()


# ── App principal ──────────────────────────────────────────────────
app = FastAPI(
    title="D.A.N.N.A. Backend",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dannaengine.com",
        "https://www.dannaengine.com",
        "http://localhost:5173",   # Vite dev (frontend React local)
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Montar tu api.py existente (registro + webhook LemonSqueezy) ──
try:
    from api import app as legacy_api_app
    for route in legacy_api_app.routes:
        app.routes.append(route)
    log.info(f"api.py montado — {len(legacy_api_app.routes)} rutas")
except Exception as e:
    log.error(f"No pude montar api.py: {e}")


# ── Routers nuevos (api_v2) ────────────────────────────────────────
# Se irán agregando en próximas entregas:
#   from api_v2.auth_routes import router as auth_router
#   app.include_router(auth_router)
try:
    from api_v2.auth_routes import router as auth_router
    app.include_router(auth_router)
    log.info("api_v2.auth_routes montado (/api/login, /api/logout, /api/me)")
except Exception as e:
    log.error(f"No pude montar api_v2.auth_routes: {e}")

try:
    from api_v2.state_routes import router as state_router
    app.include_router(state_router)
    log.info("api_v2.state_routes montado (/api/state, /api/sequence, /api/session/*, /api/admin/sessions)")
except Exception as e:
    log.error(f"No pude montar api_v2.state_routes: {e}")

try:
    from api_v2.spin_routes import router as spin_router
    app.include_router(spin_router)
    log.info("api_v2.spin_routes montado (/api/spin)")
except Exception as e:
    log.error(f"No pude montar api_v2.spin_routes: {e}")

try:
    from api_v2.bankroll_routes import router as bankroll_router
    app.include_router(bankroll_router)
    log.info("api_v2.bankroll_routes montado (/api/bankroll/*)")
except Exception as e:
    log.error(f"No pude montar api_v2.bankroll_routes: {e}")

try:
    from api_v2.pilot_routes import router as pilot_router
    app.include_router(pilot_router)
    log.info("api_v2.pilot_routes montado (/api/pilot/override, /api/pilot/override/clear)")
except Exception as e:
    log.error(f"No pude montar api_v2.pilot_routes: {e}")

# ── Maintenance del session_manager ─────────────────────────────
try:
    from core.session_manager import session_manager
    session_manager.start_maintenance()
    log.info("session_manager: maintenance thread iniciado")

    @app.on_event("shutdown")
    def _save_sessions_on_shutdown():
        try:
            session_manager.save_all()
            session_manager.stop_maintenance()
            log.info("session_manager: sesiones guardadas en shutdown")
        except Exception as e:
            log.warning(f"session_manager shutdown: {e}")
except Exception as e:
    log.error(f"No pude inicializar session_manager: {e}")


# ── System status ─────────────────────────────────────────────────
@app.get("/api/system/status")
def system_status():
    return {
        "service": "danna-backend",
        "version": "v2-react",
        "frontend_dist_exists": FRONTEND_DIST.exists(),
    }


# ── Servir el build de React ──────────────────────────────────────
if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="assets",
    )
    log.info(f"Frontend build encontrado en {FRONTEND_DIST}")

    @app.get("/")
    async def root_index():
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(404, "index.html no encontrado")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("assets/"):
            raise HTTPException(404, "Not found")
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(404, "Not found")
else:
    log.info("Frontend build NO encontrado — solo API disponible")

    @app.get("/")
    async def root_no_frontend():
        return {
            "service": "D.A.N.N.A. Backend",
            "status": "ok",
            "note": "Frontend React no construido aun",
            "api_docs": "/api/docs",
        }
