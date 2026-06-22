#!/bin/bash
# D.A.N.N.A. — Start script (backend nuevo)
# ==========================================
# Solo FastAPI. Sin Streamlit. El Streamlit viejo vive en otro Railway.
# Cuando React esté listo, se cambia DNS al nuevo y se apaga el viejo.
set -e

# ────────────────────────────────────────────────────────────────────
# Seed copy: garantizar que /app/data/models_v3_17R/_seed/ existe
# ────────────────────────────────────────────────────────────────────
# El motor busca archivos en /app/data/models_v3_17R/{user_id}/
# Para usuarios nuevos, copia el seed baseline si todavia no existe
# en el volumen persistente.
# ────────────────────────────────────────────────────────────────────
SEED_SRC="/app/models_v3_17R/_seed"
SEED_DST="/app/data/models_v3_17R/_seed"

if [ -d "$SEED_SRC" ]; then
    if [ ! -d "$SEED_DST" ]; then
        echo "[start.sh] Copiando seed baseline al volumen..."
        mkdir -p "$SEED_DST"
        cp -r "$SEED_SRC"/* "$SEED_DST/"
        echo "[start.sh] Seed copiado: $SEED_DST"
        ls -la "$SEED_DST"
    else
        echo "[start.sh] Seed ya existe en volumen: $SEED_DST (no se sobrescribe)"
    fi
    
    # Tambien copiar el modelo NB pre-entrenado a la raiz del volumen
    NB_MODEL_SRC="/app/models_v3_17R/nb_prior_v3_17R.joblib"
    NB_MODEL_DST="/app/data/models_v3_17R/nb_prior_v3_17R.joblib"
    if [ -f "$NB_MODEL_SRC" ] && [ ! -f "$NB_MODEL_DST" ]; then
        echo "[start.sh] Copiando modelo NB pre-entrenado al volumen..."
        cp "$NB_MODEL_SRC" "$NB_MODEL_DST"
        echo "[start.sh] Modelo NB copiado: $NB_MODEL_DST"
    fi
else
    echo "[start.sh] WARNING: $SEED_SRC no existe en la imagen Docker"
fi

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