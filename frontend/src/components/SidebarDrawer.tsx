// SidebarDrawer — Drawer izquierdo con:
//   - Protocolo de inicio (9 pasos de onboarding)
//   - Toggles: LIVE MODE FAST / DIAGNOSTIC PANELS
//   - Admin panel (solo plan=admin)
//   - Mesa context (user/table)
//   - Parámetros del motor
//   - Guardián estado vivo
//
// Port de render_sidebar() en app.py L4138-4415.

import { useState } from 'react';
import { AdminPanel } from './AdminPanel';

interface Props {
  user: { username: string; plan: string; spins_remaining: number } | null;
  spinsCount: number;
  onReset: () => void;
}

const ONBOARDING_STEPS = [
  {
    n: '01', title: 'QUÉ ES D.A.N.N.A.',
    text: 'D.A.N.N.A. es ingeniería aplicada a la ruleta: un sistema que mide probabilidades y estadística giro a giro. Reúne 5 motores, una ruleta física virtual y capas de decisión (Capa 1 y Escudo), y se apoya en más de 50.000 giros reales. Todo se construyó y se probó en mesa real, con dinero real, ganando y perdiendo. También ofrece una sugerencia de 12 números. Cada quien juega a su manera —docenas, columnas o números, según su capital y los errores que pueda aguantar—: todo es válido. D.A.N.N.A. te entrega la lectura; la decisión es tuya.',
  },
  {
    n: '02', title: 'INGRESA LOS GIROS',
    text: 'Cada número que sale en la ruleta lo ingresas como un giro, y con cada giro se actualiza todo: sugerencias, marcadores y rendimiento. Regla de oro: mínimo 80 giros ingresados antes de apostar. En esos 80 solo observas; el sistema está conociendo la mesa.',
  },
  {
    n: '03', title: 'LEE LA PANTALLA',
    text: 'JUEGA ESTO (arriba a la izquierda del Quantum Pilot) es la línea que manda: te dice qué voz sigues (Escudo o Capa 1), en qué mercado y qué zonas. Si dice NO APUESTES · ESPERA, ese giro no se apuesta. Se juega un solo mercado por giro: docenas o columnas, nunca los dos.',
  },
  {
    n: '04', title: 'LAS CUATRO VOCES',
    text: 'Motor: sus sugerencias base, 2 docenas y 2 columnas en cada giro, incluso cuando está en WAIT, PRB o BET; sus celdas DOCENAS y COLUMNAS (a la derecha) muestran sus aciertos, errores y rachas. Capa 1: la guía principal. Escudo: la cobertura cuando hay tendencia clara. D.A.N.N.A.: la voz que elige entre Capa 1 y Escudo. Cada una lleva su propio marcador: aciertos, errores, racha y peor racha.',
  },
  {
    n: '05', title: 'RENDIMIENTO EN VIVO',
    text: 'La franja de arriba compara las cuatro voces en los últimos 12 giros y te dice cuál va mejor y cuál peor, por ejemplo "Mejor: Motor y Capa 1 · Peor: Escudo y D.A.N.N.A.". Cambia sola mientras juegas; ▲ indica que una voz viene mejorando y ▼ que viene empeorando. "Parejo" significa que ninguna se despega. A veces el Motor solo rinde mejor que las capas: úsala para conocer la mesa. Es una lectura de apoyo; no cambia lo que dice JUEGA ESTO.',
  },
  {
    n: '06', title: 'CASILLAS Y CALOR',
    text: 'La casilla donde estás parado tiene un semáforo: Santuario y Verde son zonas tranquilas, Probe pide cuidado, Tóxica y Agujero son para salir. CALOR RECIENTE te muestra qué zona se está calentando en los últimos giros y cuándo se enfría o termina. Lee las señales juntas; ninguna sola es una orden.',
  },
  {
    n: '07', title: 'GESTIÓN Y DISCIPLINA',
    text: 'Antes de sentarte define cuánto juegas hoy, cuánto estás dispuesto a perder y cuándo te das por satisfecho. Nunca subas la ficha por instinto. Al 3er error seguido aplica el freno: pausa de 3 giros con la ficha congelada y retomas en el 4.º. Si la mesa no da señales claras, esperar también es jugar bien.',
  },
  {
    n: '08', title: 'LA BITÁCORA',
    text: 'En BITÁCORA (arriba, junto a SALIR) planeas la jornada antes de empezar: sesiones, horarios, descansos, saldos y meta. En vivo no se llena nada. Al terminar cada sesión dedica unos 5 minutos: saldo inicial y final, si cumpliste la meta, si seguiste las instrucciones del motor (sí, parcial o no), cómo la sentiste y, si te saliste de la mesa, por qué. Se guarda en tu cuenta y la descargas en CSV para tu retroalimentación del día. Solo registra: no decide nada por el motor.',
  },
  {
    n: '09', title: 'CAMBIAR DE MESA Y CERRAR',
    text: 'Cada mesa física es una sesión distinta. Al cambiar de mesa usa NUEVA MESA (RESET) y vuelve a ingresar 80 giros antes de apostar. Al terminar, exporta el CSV en REGISTRO DE SESIÓN y cierra tu jornada en la Bitácora.',
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
              {activeSection === 'admin' && <AdminPanel />}
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
