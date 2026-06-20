"""
danna_core — Lógica de negocio de D.A.N.N.A.
=============================================
Capa de lógica pura, independiente de la UI (Streamlit o React/FastAPI).

Esta capa fue extraída de app.py durante la migración a React. Las funciones
aquí NO dependen de Streamlit. Las que necesitan estado de sesión lo reciben
como parámetro `state` (un dict-like: st.session_state o UserSession).

Módulos:
    constants    — constantes de ruleta y config (REDS, EPS, etc.)
    helpers      — utilidades genéricas (_safe_int, _safe_float, etc.)
    roulette     — matemática de ruleta (color, paridad, docenas, columnas)
    evaluation   — evaluación de hits/aciertos
    suggestion   — cálculo de sugerencias y bet advice
    bankroll     — settlement y cálculo de bankroll
    session_io   — logging y persistencia JSONL

Sesión A de la migración: extraídas las funciones SIN estado.
Sesión B (pendiente): funciones con estado + run_spin_processing.
"""
