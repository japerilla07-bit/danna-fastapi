FROM python:3.10-slim

WORKDIR /app

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Asegurar que httpx esté disponible para el proxy reverso a Streamlit.
# (Si ya está en requirements.txt, esto es no-op.)
RUN pip install --no-cache-dir 'httpx>=0.25,<1.0' 'uvicorn[standard]>=0.24'

# Copiar todo el código
COPY . .

# Crear directorios necesarios si no existen
RUN mkdir -p models_v3_17R models_v3_17R/_seed logs sessions

# Permisos del start
RUN chmod +x start.sh

# Solo exponemos el puerto público (Railway inyecta $PORT).
# El puerto interno 8501 de Streamlit NO se expone.
EXPOSE 8000

# Healthcheck para que Railway sepa que el server está vivo
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8000}/api/health || exit 1

ENTRYPOINT ["bash", "start.sh"]
