# ────────────────────────────────────────────────────────────────────
# D.A.N.N.A. — Production Dockerfile (FastAPI + React)
# Multi-stage build:
#   Stage 1: Node — construye el frontend React → frontend_dist/
#   Stage 2: Python — runtime, copia frontend_dist desde Stage 1
# ────────────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════════
# STAGE 1 — Build del frontend
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copiar manifests primero para cache de capas (si no cambian → npm install se cachea)
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Instalar deps del frontend
RUN cd frontend && npm ci --no-audit --no-fund

# Copiar resto del frontend
COPY frontend/ ./frontend/

# Build → genera /build/frontend_dist/
RUN cd frontend && npm run build


# ═══════════════════════════════════════════════════════════════════
# STAGE 2 — Runtime Python
# ═══════════════════════════════════════════════════════════════════
FROM python:3.12-slim AS runtime

# Variables de entorno para Python en producción
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias del sistema (mínimas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python (capa cacheada si requirements no cambia)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código del backend
COPY . .

# Copiar el build del frontend desde Stage 1 → /app/frontend_dist
COPY --from=frontend-builder /build/frontend_dist /app/frontend_dist

# Asegurar que start.sh sea ejecutable
RUN chmod +x start.sh

# Crear directorios runtime que no existan (volumen los reemplaza si está montado)
RUN mkdir -p /app/data/models_v3_17R /app/data/sessions /app/data/logs

# Healthcheck (Railway necesita saber que el server arrancó bien)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8000}/api/system/status || exit 1

# Railway inyecta $PORT — no hardcodeamos
EXPOSE 8000

ENTRYPOINT ["bash", "start.sh"]