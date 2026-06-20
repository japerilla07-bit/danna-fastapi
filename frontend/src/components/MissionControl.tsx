// MissionControl — Panel compacto: solo SPIN input + botón PROCESS SPIN.
// Sin campo NOTAS (eliminado completo por decisión del usuario).
// Port simplificado de "Control de Misión" en app.py L9049-9090.

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useSpinMutation } from '@/hooks/useGameState';

export function MissionControl() {
  const [spin, setSpin] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const spinMutation = useSpinMutation();
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-enfocar el input siempre que:
  //   - El componente se monta (inicio de sesión)
  //   - El spin se procesa exitosamente (isSuccess cambia)
  //   - El pending termina (isPending vuelve a false)
  useEffect(() => {
    if (!spinMutation.isPending) {
      inputRef.current?.focus();
    }
  }, [spinMutation.isPending]);

  function tryProcess(e?: FormEvent) {
    if (e) e.preventDefault();
    if (spinMutation.isPending) return;
    setWarning(null);

    const raw = spin.trim();
    if (raw === '') {
      setWarning('Ingresa un número.');
      return;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n)) {
      setWarning('Entrada inválida (0-36).');
      return;
    }
    if (n < 0 || n > 36) {
      setWarning('Fuera de rango (0-36).');
      return;
    }

    spinMutation.mutate(
      { spin: n, notes: '' },
      {
        onSuccess: () => {
          setSpin('');
          // focus explícito inmediato tras limpiar
          setTimeout(() => inputRef.current?.focus(), 0);
        },
        onError: (err: any) => setWarning(err?.message || 'Error al procesar.'),
      }
    );
  }

  function onSpinKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryProcess();
    }
  }

  return (
    <div className="panel">
      <div className="mc-head">
        <span className="mc-icon">⚡</span>
        <span className="mc-title">CONTROL DE MISIÓN</span>
      </div>
      <div className="mc-sub">
        Registrar giro + liquidación automática de bankroll.
      </div>

      <form onSubmit={tryProcess}>
        <div className="mc-field">
          <label>SPIN (0–36)</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={spin}
            onChange={(e) => setSpin(e.target.value)}
            onKeyDown={onSpinKey}
            placeholder="0–36"
            disabled={spinMutation.isPending}
            autoFocus
          />
        </div>

        {warning && <div className="mc-warning">⚠ {warning}</div>}

        <button
          type="submit"
          className="btn-process"
          disabled={spinMutation.isPending || !spin.trim()}
        >
          {spinMutation.isPending ? '◌ PROCESANDO...' : '⬡ PROCESS SPIN — UPDATE ENGINE'}
        </button>
      </form>
    </div>
  );
}
