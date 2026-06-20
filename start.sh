#!/bin/bash
# D.A.N.N.A. — Start script (backend nuevo)
# ==========================================
# Solo FastAPI. Sin Streamlit. El Streamlit viejo vive en otro Railway.
# Cuando React esté listo, se cambia DNS al nuevo y se apaga el viejo.

set -e

PORT="${PORT:-8000}"

echo "=========================================="
echo "  D.A.N.N.A. backend (v2)"
echo "  Public port: $PORT"
echo "=========================================="

exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1 \
    --loop asyncio \
    --proxy-headers \
    --forwarded-allow-ips '*'
