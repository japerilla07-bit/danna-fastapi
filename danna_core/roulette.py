"""
danna_core.roulette
===================
Matemática pura de ruleta europea: color, paridad, rango, docenas, columnas.
Sin estado, sin UI.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

from danna_core.constants import REDS, _MB_RED


def _color_of_spin(n: int):
    if n == 0:
        return None
    return "rojo" if n in REDS else "negro"

def _paridad_of_spin(n: int):
    if n == 0:
        return None
    return "par" if (n % 2 == 0) else "impar"

def _rango_of_spin(n: int):
    if n == 0:
        return None
    return "bajo" if (1 <= n <= 18) else "alto"

def _docena_bucket_of_spin(n: int):
    if n == 0:
        return "0"
    if 1 <= n <= 12:
        return "1-12"
    if 13 <= n <= 24:
        return "13-24"
    if 25 <= n <= 36:
        return "25-36"
    return None

def _docena_bucket_from_pick(pick):
    if pick is None:
        return None
    s = str(pick).strip().lower()
    if "1-12" in s or "1 a 12" in s or "prim" in s or s == "1":
        return "1-12"
    if "13-24" in s or "13 a 24" in s or "seg" in s or s == "2":
        return "13-24"
    if "25-36" in s or "25 a 36" in s or "ter" in s or s == "3":
        return "25-36"
    return None

def _col_bucket_of_spin(n: int):
    if n == 0:
        return "0"
    r = n % 3
    if r == 1:
        return "1"
    if r == 2:
        return "2"
    return "3"

def _col_bucket_from_pick(pick):
    if pick is None:
        return None
    s = str(pick).strip().lower()
    if "columna 1" in s or "col 1" in s or s == "1":
        return "1"
    if "columna 2" in s or "col 2" in s or s == "2":
        return "2"
    if "columna 3" in s or "col 3" in s or s == "3":
        return "3"
    return None

def _mb_color_of(n: int):
    if n == 0:
        return None
    return "Rojo" if n in _MB_RED else "Negro"

def _mb_parity_of(n: int):
    if n == 0:
        return None
    return "Par" if (n % 2 == 0) else "Impar"

def _mb_range_of(n: int):
    if n == 0:
        return None
    return "Bajo" if (1 <= n <= 18) else "Alto"

def _mb_dozen_of(n: int):
    if n == 0:
        return None
    if 1 <= n <= 12:
        return "1-12"
    if 13 <= n <= 24:
        return "13-24"
    if 25 <= n <= 36:
        return "25-36"
    return None

def _mb_column_of(n: int):
    if n == 0:
        return None
    r = n % 3
    if r == 1:
        return "Columna 1"
    if r == 2:
        return "Columna 2"
    return "Columna 3"
