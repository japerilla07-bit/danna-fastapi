"""
danna_core.constants
=====================
Constantes de ruleta y configuración. Sin dependencias.

Extraído de app.py (migración Sesión A).
"""

# ── Ruleta europea ────────────────────────────────────────────────
# Números rojos en la ruleta europea (los demás 1-36 son negros, 0 es verde)
REDS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

# Alias usado por el módulo de "manual bets" (mismo conjunto que REDS)
_MB_RED = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

# ── Numérico ──────────────────────────────────────────────────────
# Epsilon para evitar divisiones por cero y comparaciones de floats
EPS = 1e-12

# ── Logging ───────────────────────────────────────────────────────
# Tamaño máximo de un archivo JSONL de log antes de rotar (5MB)
_JSONL_MAX_BYTES = 5 * 1024 * 1024

# ── Error history aliases ─────────────────────────────────────────
# Mapeo de nombres legacy de categorías a nombres internos
_EH_ALIAS = {
    "principal": "primary",
    "numeros": "max_conf",
}
_EH_REVERSE = {v: k for (k, v) in _EH_ALIAS.items()}
