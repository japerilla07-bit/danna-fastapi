// SessionPanel — Panel de control de sesión.
// Va debajo del WarTerminal en la columna izquierda.
//
// Botones:
//   - RESET — NEW TABLE SESSION → POST /api/session/reset
//   - ARCHIVE SEQUENCE LOG      → acción futura / local
//
// Collapsibles:
//   - SEQUENCE ARCHIVE / EXPORT
//   - ⚠️ Aviso

import { useState } from 'react';
import { useResetMutation } from '@/hooks/useGameState';

export function SessionPanel() {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [avisoOpen, setAvisoOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const resetMutation = useResetMutation();

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetMutation.mutate(undefined, {
      onSuccess: () => setConfirmReset(false),
      onError: () => setConfirmReset(false),
    });
  }

  return (
    <div className="panel session-panel">
      <div className="session-head">
        <span className="session-icon">🛰️</span>
        <span className="session-title">SESIÓN</span>
      </div>

      <div className="session-buttons">
        <button
          className={`btn-session btn-reset${confirmReset ? ' btn-confirm' : ''}`}
          onClick={handleReset}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending
            ? '◌ RESETEANDO...'
            : confirmReset
              ? '⚠ CONFIRMAR RESET'
              : '↺ RESET — NEW TABLE SESSION'}
        </button>

        <button
          className="btn-session btn-archive"
          onClick={() => setArchiveOpen(!archiveOpen)}
        >
          ▣ ARCHIVE SEQUENCE LOG
        </button>
      </div>

      {/* Collapsible: Archive */}
      {archiveOpen && (
        <div className="session-collapsible-body">
          <div className="session-collapsible-content">
            <p>Exporta el sequence log actual antes de resetear la sesión.</p>
            <button className="btn-session-export">⬇ DESCARGAR CSV</button>
          </div>
        </div>
      )}

      <div className="session-divider" />

      {/* Collapsible: Aviso */}
      <div
        className="session-collapsible-header"
        onClick={() => setAvisoOpen(!avisoOpen)}
      >
        <span className="session-arrow">{avisoOpen ? '▾' : '▸'}</span>
        <span>⚠️ Aviso</span>
      </div>

      {avisoOpen && (
        <div className="session-collapsible-body">
          <div className="session-collapsible-content warn">
            Reset borra todos los spins, contadores y estado del motor de la sesión actual.
            No afecta el bankroll. Esta acción no se puede deshacer.
          </div>
        </div>
      )}
    </div>
  );
}
