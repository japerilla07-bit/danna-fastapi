// SidebarDrawer — Drawer izquierdo con:
//   - Protocolo de inicio (7 pasos onboarding)
//   - Toggles: LIVE MODE FAST / DIAGNOSTIC PANELS
//   - Admin panel (solo plan=admin)
//   - Mesa context (user/table)
//   - Parámetros del motor
//   - Guardián estado vivo
//
// Port de render_sidebar() en app.py L4138-4415.

import { useState } from 'react';

interface Props {
  user: { username: string; plan: string; spins_remaining: number } | null;
  spinsCount: number;
  onReset: () => void;
}

const ONBOARDING_STEPS = [
  {
    n: '01', title: 'CALIBRACIÓN',
    text: 'Ingresa los primeros 30 spins sin apostar. El motor necesita este histórico mínimo para calibrar sus modelos internos (NB, LSTM, mesa_score).',
  },
  {
    n: '02', title: 'VALIDACIÓN DE PATRONES',
    text: 'Del spin 30 al 80, el motor entra en modo PROBE. Las apuestas deben ser mínimas — el sistema está validando si hay patrones estadísticamente explotables en esta mesa.',
  },
  {
    n: '03', title: 'LECTURA DEL HUD',
    text: 'El HUD muestra OPTIMAL / CAUTION / ABORT. Solo opera con fuerza cuando dice OPTIMAL. CAUTION = stake reducido a la mitad. ABORT = no operar.',
  },
  {
    n: '04', title: 'RADAR Y MESA SCORE',
    text: 'El Radar (X/10) refleja la calidad estadística de la mesa. El GOD BET requiere RADAR ≥ 7 + HUD OPTIMAL + Table Health ≥ 50. Si no se cumplen las 3, NO entres en GOD.',
  },
  {
    n: '05', title: 'GESTIÓN DE BANKROLL',
    text: 'Configura el capital inicial real antes de operar. Los ajustes de stake siguen la progresión L1/L2/L3/L4. Nunca subas de nivel sin que el motor lo indique.',
  },
  {
    n: '06', title: 'DISCIPLINA DE SALIDA',
    text: 'Si el HUD cae a ABORT: para inmediatamente. Si llegas a L4 con 3+ errores consecutivos: cierra la sesión. El motor te dirá cuándo volver.',
  },
  {
    n: '07', title: 'REGISTRO DE MESA',
    text: 'Cada mesa física es una sesión diferente. Usa RESET cuando cambies de mesa. El historial de una mesa no es válido para predecir otra.',
  },
];

export function SidebarDrawer({ user, spinsCount, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [fastMode, setFastMode] = useState(true);
  const [diagPanels, setDiagPanels] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const isAdmin = user?.plan === 'admin';

  function toggle(section: string) {
    setActiveSection(s => s === section ? null : section);
  }

  return (
    <>
      {/* Botón hamburguesa */}
      <button
        className="sidebar-hamburger"
        onClick={() => setOpen(true)}
        title="Abrir panel de configuración"
      >
        <span />
        <span />
        <span />
      </button>

      {/* Overlay de fondo */}
      {open && (
        <div className="sidebar-backdrop" onClick={() => setOpen(false)} />
      )}

      {/* Drawer */}
      <div className={`sidebar-drawer ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="sidebar-logo-d">D</span>
            <span className="sidebar-logo-rest">.A.N.N.A</span>
          </div>
          <div className="sidebar-version">v1.0</div>
          <button className="sidebar-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="sidebar-content">
          {/* Protocolo de inicio */}
          <button className="sidebar-protocol-btn" onClick={() => setShowOnboarding(true)}>
            <span>📋</span> VER PROTOCOLO DE INICIO
          </button>

          <div className="sidebar-divider" />

          {/* Toggles de modo */}
          <div className="sidebar-section-title">MODO DE OPERACIÓN</div>

          <div className="sidebar-toggle-row" onClick={() => setFastMode(!fastMode)}>
            <div className="sidebar-toggle-info">
              <span className="sidebar-toggle-label">⚡ LIVE MODE — FAST</span>
              <span className="sidebar-toggle-sub">Minimiza paneles técnicos en tiempo real</span>
            </div>
            <div className={`sidebar-toggle-switch ${fastMode ? 'on' : ''}`}>
              <div className="sidebar-toggle-thumb" />
            </div>
          </div>

          <div className="sidebar-toggle-row" onClick={() => setDiagPanels(!diagPanels)}>
            <div className="sidebar-toggle-info">
              <span className="sidebar-toggle-label">◈ DIAGNOSTIC PANELS</span>
              <span className="sidebar-toggle-sub">Activa paneles de diagnóstico avanzado</span>
            </div>
            <div className={`sidebar-toggle-switch ${diagPanels ? 'on' : ''}`}>
              <div className="sidebar-toggle-thumb" />
            </div>
          </div>

          <div className="sidebar-divider" />

          {/* Mesa context */}
          <div
            className={`sidebar-collapsible-header ${activeSection === 'mesa' ? 'active' : ''}`}
            onClick={() => toggle('mesa')}
          >
            <span>🧿 MESA &amp; USUARIO</span>
            <span className="sidebar-chevron">{activeSection === 'mesa' ? '▾' : '▸'}</span>
          </div>
          {activeSection === 'mesa' && (
            <div className="sidebar-collapsible-body">
              <div className="sidebar-kv">
                <span className="sidebar-k">USUARIO</span>
                <span className="sidebar-v">{user?.username ?? '—'}</span>
              </div>
              <div className="sidebar-kv">
                <span className="sidebar-k">PLAN</span>
                <span className="sidebar-v" style={{ color: 'var(--cyan)' }}>
                  {user?.plan?.toUpperCase() ?? '—'}
                </span>
              </div>
              <div className="sidebar-kv">
                <span className="sidebar-k">SPINS</span>
                <span className="sidebar-v">{spinsCount} en sesión actual</span>
              </div>
              <div className="sidebar-kv">
                <span className="sidebar-k">RESTANTES</span>
                <span className="sidebar-v">{user?.spins_remaining?.toLocaleString() ?? '—'}</span>
              </div>
              <button className="sidebar-action-btn danger" onClick={onReset}>
                🆕 NUEVA MESA (RESET)
              </button>
            </div>
          )}

          {/* Admin panel */}
          {isAdmin && (
            <>
              <div className="sidebar-divider" />
              <div
                className={`sidebar-collapsible-header ${activeSection === 'admin' ? 'active' : ''}`}
                onClick={() => toggle('admin')}
              >
                <span>🔴 ADMIN PANEL</span>
                <span className="sidebar-chevron">{activeSection === 'admin' ? '▾' : '▸'}</span>
              </div>
              {activeSection === 'admin' && (
                <div className="sidebar-collapsible-body">
                  <div className="sidebar-admin-note">
                    Panel de administración disponible. Acceso completo al sistema.
                  </div>
                  <div className="sidebar-kv">
                    <span className="sidebar-k">PLAN</span>
                    <span className="sidebar-v" style={{ color: 'var(--red)' }}>ADMIN — ACCESO TOTAL</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Diagnóstico - solo si diagPanels activo */}
          {diagPanels && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-title">DIAGNÓSTICO</div>

              <div
                className={`sidebar-collapsible-header ${activeSection === 'guardian' ? 'active' : ''}`}
                onClick={() => toggle('guardian')}
              >
                <span>🧠 GUARDIÁN — ESTADO VIVO</span>
                <span className="sidebar-chevron">{activeSection === 'guardian' ? '▾' : '▸'}</span>
              </div>
              {activeSection === 'guardian' && (
                <div className="sidebar-collapsible-body">
                  <div className="sidebar-admin-note">
                    El panel muestra el último pick observado por el core al evaluar un spin (LAST),
                    no la recomendación vigente (NEXT).
                  </div>
                  <div className="sidebar-kv">
                    <span className="sidebar-k">DOCENA</span>
                    <span className="sidebar-v" style={{ color: 'var(--txt-md)' }}>Ver logs del motor</span>
                  </div>
                  <div className="sidebar-kv">
                    <span className="sidebar-k">COLUMNA</span>
                    <span className="sidebar-v" style={{ color: 'var(--txt-md)' }}>Ver logs del motor</span>
                  </div>
                </div>
              )}

              <div
                className={`sidebar-collapsible-header ${activeSection === 'params' ? 'active' : ''}`}
                onClick={() => toggle('params')}
              >
                <span>⚙️ PARÁMETROS DEL MOTOR</span>
                <span className="sidebar-chevron">{activeSection === 'params' ? '▾' : '▸'}</span>
              </div>
              {activeSection === 'params' && (
                <div className="sidebar-collapsible-body">
                  <div className="sidebar-admin-note">
                    Los parámetros base del motor. Modificar requiere reiniciar la sesión.
                  </div>
                  {[
                    ['MIN START', '30 spins', 'Spins mínimos para activar predicciones'],
                    ['WINDOW LONG', '100 spins', 'Ventana larga del análisis de patrones'],
                    ['WINDOW SHORT', '12 spins', 'Ventana corta para señales rápidas'],
                    ['CONF THRESHOLD', '0.44', 'Umbral mínimo de confianza para BET'],
                    ['L MAX', '2', 'Pérdidas consecutivas antes de pausa'],
                    ['M PAUSE', '4', 'Spins de pausa tras L_MAX'],
                  ].map(([k, v, hint]) => (
                    <div key={k} className="sidebar-kv" title={hint as string}>
                      <span className="sidebar-k">{k}</span>
                      <span className="sidebar-v" style={{ color: 'var(--cyan)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="sidebar-divider" />

          {/* Info */}
          <div className="sidebar-footer-info">
            <div>D.A.N.N.A v1.0 — {spinsCount} spins en sesión</div>
            <div style={{ color: 'var(--txt-lo)', marginTop: 4 }}>dannaengine.com</div>
          </div>
        </div>
      </div>

      {/* Modal Protocolo de Inicio */}
      {showOnboarding && (
        <div className="onboarding-backdrop" onClick={() => setShowOnboarding(false)}>
          <div className="onboarding-modal" onClick={e => e.stopPropagation()}>
            <div className="onboarding-header">
              <div className="onboarding-title">📋 PROTOCOLO DE INICIO D.A.N.N.A</div>
              <button className="onboarding-close" onClick={() => setShowOnboarding(false)}>✕</button>
            </div>
            <div className="onboarding-steps">
              {ONBOARDING_STEPS.map(s => (
                <div key={s.n} className="onboarding-step">
                  <div className="onboarding-step-num">{s.n}</div>
                  <div className="onboarding-step-body">
                    <div className="onboarding-step-title">{s.title}</div>
                    <div className="onboarding-step-text">{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="onboarding-footer">
              <button className="onboarding-got-it" onClick={() => setShowOnboarding(false)}>
                ENTENDIDO — INICIAR
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
