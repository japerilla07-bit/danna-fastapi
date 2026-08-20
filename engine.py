r"""
backend/engine.py — SHIM DE COMPATIBILIDAD. No contiene lógica.

PROBLEMA QUE RESUELVE
---------------------
Existían DOS archivos de motor a la vez:

    backend/engine.py            <- importado como `import engine`
    backend/danna_core/engine.py <- importado como `from danna_core.engine import ...`

Python los cargaba como DOS MÓDULOS DISTINTOS, cada uno con su propio estado
global (cusum, nb_model, loss_state, _GUARDIAN_CORE, _WHEEL_EXPERT...). O sea:
lo que escribía un lado, el otro no lo veía. Y además el código de los dos
archivos había divergido — 8.684 líneas contra 8.696.

Varios módulos dependen del import corto (`import engine as engine_module`):
processor.py, processor_helpers.py y posiblemente otros. Borrar este archivo
rompe la cadena processor -> state_routes -> router y /api/state devuelve 404.

CÓMO FUNCIONA
-------------
La línea `sys.modules[__name__] = _real` sustituye este módulo por el real en
la tabla de módulos de Python. A partir de ahí:

    import engine              is  danna_core.engine   ->  True

No es un alias ni una copia: es EL MISMO OBJETO. Un solo estado global, una
sola fuente de verdad, y todos los `import engine` existentes siguen
funcionando sin tocar ni una línea en los archivos que los hacen.

MANTENIMIENTO
-------------
NO añadir código aquí. Toda la lógica vive en danna_core/engine.py.
Si algún día se migran todos los `import engine` a `from danna_core import
engine`, este archivo se puede borrar — pero antes hay que comprobarlo con:

    Select-String -Recurse -Filter *.py -Pattern "^\s*(import|from)\s+engine\b"
"""

import sys as _sys

import danna_core.engine as _real

# Sustitución del módulo: `import engine` devuelve el objeto de danna_core.engine
_sys.modules[__name__] = _real
