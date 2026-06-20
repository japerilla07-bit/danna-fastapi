"""
danna_core.helpers
==================
Utilidades genéricas sin estado ni dependencias de UI.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

import os
import math

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None


def _safe_list_like(x):
    """Return python list for list/tuple/np.ndarray inputs, else [] (never bool(ndarray))."""
    if x is None:
        return []
    try:
        import numpy as np
        if isinstance(x, np.ndarray):
            return x.tolist()
    except Exception:
        pass
    if isinstance(x, list):
        return x
    if isinstance(x, tuple):
        return list(x)
    return []

def list_safe_list_like(x):
    """Alias for _safe_list_like (kept for backward compatibility inside this app)."""
    return _safe_list_like(x)

def len_safe_list_like(x):
    """Safe len() for list/tuple/ndarray inputs (never bool(ndarray))."""
    return len(_safe_list_like(x))

def _safe_int(x, default=0):
    try:
        if x is None:
            return default
        # Handle numpy types without triggering truthiness
        try:
            import numpy as np
            if isinstance(x, np.ndarray):
                flat = x.reshape(-1)
                if flat.size == 0:
                    return default
                x = flat[0].item() if hasattr(flat[0], "item") else flat[0]
            elif isinstance(x, np.generic):
                x = x.item()
        except Exception:
            pass
        # Handle list/tuple
        if isinstance(x, (list, tuple)):
            if not x:
                return default
            x = x[0]
        return int(x)
    except Exception:
        return default

def _safe_float(x, default=0.0):
    try:
        if x is None:
            return default
        return float(x)
    except Exception:
        return default

def _finite(x, default=0.0) -> float:
    """Cast to finite float; fallback to default when NaN/Inf/invalid."""
    try:
        v = float(x)
        return v if math.isfinite(v) else float(default)
    except Exception:
        return float(default)

def _coalesce_none(*vals):
    for v in vals:
        if v is not None:
            return v
    return None

def _deep_jsonable(obj):
    """Recursively convert numpy arrays/scalars to JSON-safe python types."""
    try:
        import numpy as np
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.generic):
            return obj.item()
    except Exception:
        pass
    if isinstance(obj, dict):
        return {k: _deep_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_deep_jsonable(v) for v in obj]
    return obj

def _safe_text(x, default=""):
    if x is None:
        return default
    try:
        import numpy as np
        if isinstance(x, np.ndarray):
            flat = x.reshape(-1)
            if flat.size == 0:
                return default
            # Join first elements as text (bounded) without boolean evaluation
            parts = []
            for v in flat[:10]:
                try:
                    parts.append(str(v.item() if hasattr(v, "item") else v))
                except Exception:
                    parts.append(repr(v))
            return " ".join(parts)
        if isinstance(x, np.generic):
            x = x.item()
    except Exception:
        pass
    try:
        return str(x)
    except Exception:
        return default

def _safe_mkdir(path: str):
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass

def _first_present(*vals):
    """Return the first value that is not None and not an empty string/list/dict.
    Critically: never evaluates numpy arrays in boolean context.
    """
    for v in vals:
        if v is None:
            continue
        # numpy array / numpy scalar
        try:
            import numpy as _np
            if isinstance(v, _np.ndarray):
                return v
            if isinstance(v, _np.generic):
                try:
                    return v.item()
                except Exception:
                    return v
        except Exception:
            pass
        if isinstance(v, str):
            if v.strip() == "":
                continue
            return v
        if isinstance(v, (list, tuple, set)):
            if len(v) == 0:
                continue
            return v
        if isinstance(v, dict):
            if len(v) == 0:
                continue
            return v
        return v
    return None
