"""
danna_core.session_io
=====================
Logging JSONL y utilidades de IO de sesión.
Lógica pura sin estado de Streamlit.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

import os
import json

from danna_core.constants import _JSONL_MAX_BYTES, _EH_ALIAS, _EH_REVERSE
from danna_core.helpers import _safe_mkdir


def _eh_keys_for_update(counter_key: str):
    """Return list of keys to update in error_hist given a counters key."""
    ks = [counter_key]
    ak = _EH_REVERSE.get(counter_key)
    if ak:
        ks.append(ak)
    return ks

def _append_jsonl(path: str, obj: dict):
    """Append seguro a JSONL con rotación automática (max 5MB)."""
    try:
        _safe_mkdir(os.path.dirname(path))
        # Rotate if file too large
        try:
            if os.path.exists(path) and os.path.getsize(path) > _JSONL_MAX_BYTES:
                rotated = path + ".old"
                try:
                    os.remove(rotated)
                except Exception:
                    pass
                os.rename(path, rotated)
        except Exception:
            pass
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False, allow_nan=False) + "\n")
    except Exception:
        pass
