/* ════════════════════════════════════════════════════════════════
 * QUANTUM PILOT — Premium overlay
 * Paleta dinámica según estado:
 *   STANDBY: crimson/fire/gold + cyan
 *   ACTIVE:  emerald/jade/lime + gold (todo verde brillante)
 * ════════════════════════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Barlow+Condensed:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

/* Variables locales */
.qp-overlay, .qp-min {
  --qp-bg:       #06080e;
  --qp-bg2:      #0b0e18;
  --qp-card:     #0f1220;
  --qp-cardhi:   #141828;
  --qp-border:   #1c2135;
  --qp-crimson:  #c0152a;
  --qp-fire:     #e8253f;
  --qp-ember:    #ff4455;
  --qp-gold:     #d4a017;
  --qp-amber:    #ffb800;
  --qp-shine:    #ffd860;
  --qp-cyan:     #00d4ff;
  --qp-jade:     #1ed97a;
  --qp-emerald:  #00ff9c;
  --qp-lime:     #b5ff4d;
  --qp-chalk:    #eef0f5;
  --qp-muted:    #556070;
}

/* ── Overlay container ── */
.qp-overlay {
  position: fixed;
  z-index: 9999;
  width: 760px;
  display: flex; flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  font-family: 'Barlow Condensed', sans-serif;
  color: var(--qp-chalk);
  user-select: none;
  transition: box-shadow 600ms ease;
}

/* ── STANDBY: fondo + glow rojo ── */
.qp-overlay.qp-standby-mode {
  background: var(--qp-bg);
  box-shadow:
    0 0 0 1px rgba(192,21,42,0.40),
    0 0 0 2px rgba(212,160,23,0.06),
    0 12px 60px rgba(0,0,0,0.90),
    0 0 80px rgba(192,21,42,0.10);
}

/* ── ACTIVE: fondo + glow verde brillante ── */
.qp-overlay.qp-active-mode {
  background:
    radial-gradient(ellipse at top, rgba(30,217,122,0.08) 0%, transparent 60%),
    radial-gradient(ellipse at bottom, rgba(0,212,255,0.04) 0%, transparent 60%),
    #04080a;
  box-shadow:
    0 0 0 1px rgba(30,217,122,0.55),
    0 0 0 2px rgba(0,255,156,0.10),
    0 0 50px rgba(30,217,122,0.30),
    0 12px 70px rgba(0,0,0,0.90),
    inset 0 0 80px rgba(30,217,122,0.05);
  animation: qp-active-breathe 3.5s ease-in-out infinite;
}
@keyframes qp-active-breathe {
  0%,100% {
    box-shadow:
      0 0 0 1px rgba(30,217,122,0.55),
      0 0 0 2px rgba(0,255,156,0.10),
      0 0 50px rgba(30,217,122,0.30),
      0 12px 70px rgba(0,0,0,0.90),
      inset 0 0 80px rgba(30,217,122,0.05);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(30,217,122,0.75),
      0 0 0 2px rgba(0,255,156,0.20),
      0 0 80px rgba(30,217,122,0.45),
      0 12px 70px rgba(0,0,0,0.90),
      inset 0 0 100px rgba(30,217,122,0.08);
  }
}

/* Borde animado conic-gradient */
.qp-border-ring {
  position: absolute; inset: -1px;
  border-radius: 7px;
  z-index: 0;
  pointer-events: none;
  background: conic-gradient(
    from var(--qp-angle, 0deg),
    transparent 0deg,
    rgba(232,37,63,0.9) 40deg,
    rgba(212,160,23,0.6) 80deg,
    transparent 120deg,
    rgba(0,212,255,0.3) 200deg,
    transparent 280deg,
    rgba(232,37,63,0.9) 360deg
  );
  animation: qp-border-spin 6s linear infinite;
}
.qp-active-mode .qp-border-ring {
  background: conic-gradient(
    from var(--qp-angle, 0deg),
    transparent 0deg,
    rgba(30,217,122,0.95) 30deg,
    rgba(181,255,77,0.6) 70deg,
    transparent 120deg,
    rgba(0,212,255,0.4) 200deg,
    transparent 280deg,
    rgba(30,217,122,0.95) 360deg
  );
  animation: qp-border-spin 3s linear infinite;
}
.qp-border-ring::after {
  content: '';
  position: absolute; inset: 1px;
  border-radius: 6px;
  background: var(--qp-bg);
}
.qp-active-mode .qp-border-ring::after {
  background: #04080a;
}
@property --qp-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes qp-border-spin { to { --qp-angle: 360deg; } }

/* Partículas */
.qp-particles {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  opacity: 0.40;
  pointer-events: none;
  z-index: 1;
}
.qp-active-mode .qp-particles { opacity: 0.65; }

.qp-overlay > *:not(.qp-particles):not(.qp-border-ring) {
  position: relative; z-index: 2;
}

/* ── Minimizado ── */
.qp-min {
  position: fixed; z-index: 9999;
  width: 76px; height: 76px;
  border-radius: 6px;
  cursor: pointer;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  background: var(--qp-bg2);
  border: 1px solid rgba(192,21,42,0.55);
  box-shadow:
    0 0 24px rgba(192,21,42,0.35),
    0 4px 20px rgba(0,0,0,0.80);
  animation: qp-min-pulse 2.5s ease-in-out infinite;
  transition: border-color 300ms;
}
.qp-min.qp-min-active {
  border-color: rgba(30,217,122,0.85);
  box-shadow:
    0 0 32px rgba(30,217,122,0.55),
    0 4px 20px rgba(0,0,0,0.80);
  animation: qp-min-pulse-active 1.6s ease-in-out infinite;
}
@keyframes qp-min-pulse {
  0%,100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}
@keyframes qp-min-pulse-active {
  0%,100% {
    transform: scale(1);
    box-shadow: 0 0 32px rgba(30,217,122,0.55), 0 4px 20px rgba(0,0,0,0.80);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 48px rgba(30,217,122,0.85), 0 4px 20px rgba(0,0,0,0.80);
  }
}
.qp-min-icon { font-size: 22px; filter: drop-shadow(0 0 10px currentColor); }
.qp-min-active .qp-min-icon { color: var(--qp-emerald); }
.qp-min-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; letter-spacing: 1.5px; font-weight: 700;
}
.qp-min-hr {
  font-family: 'Rajdhani', sans-serif;
  font-size: 16px; font-weight: 800; line-height: 1;
}

/* ── Header ── */
.qp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 16px;
  cursor: move;
  min-height: 42px;
  position: relative;
  transition: background 600ms ease;
}
.qp-standby-mode .qp-header {
  background:
    linear-gradient(90deg,
      rgba(139,0,0,0.30) 0%,
      rgba(192,21,42,0.12) 50%,
      rgba(212,160,23,0.06) 100%);
  border-bottom: 1px solid rgba(192,21,42,0.30);
}
.qp-active-mode .qp-header {
  background:
    linear-gradient(90deg,
      rgba(30,217,122,0.18) 0%,
      rgba(0,255,156,0.10) 50%,
      rgba(181,255,77,0.05) 100%);
  border-bottom: 1px solid rgba(30,217,122,0.45);
}
.qp-header::after {
  content: '';
  position: absolute; bottom: 0; left: 10%; right: 10%;
  height: 1px;
}
.qp-standby-mode .qp-header::after {
  background: linear-gradient(90deg, transparent, rgba(232,37,63,0.6), transparent);
}
.qp-active-mode .qp-header::after {
  background: linear-gradient(90deg, transparent, rgba(30,217,122,0.85), transparent);
  box-shadow: 0 0 8px rgba(30,217,122,0.6);
}

.qp-header-left { display: flex; align-items: center; gap: 10px; }
.qp-header-right { display: flex; align-items: center; gap: 14px; }

.qp-pulse-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--qp-muted);
  transition: all 400ms ease;
}
.qp-pulse-dot.active {
  background: var(--qp-emerald);
  box-shadow: 0 0 14px rgba(0,255,156,0.95), 0 0 24px rgba(0,255,156,0.45);
  animation: qp-dot-pulse 1.2s ease-in-out infinite;
}
@keyframes qp-dot-pulse {
  0%,100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.7); opacity: 0.5; }
}

.qp-title {
  font-family: 'Rajdhani', sans-serif;
  font-size: 15px; font-weight: 700; letter-spacing: 6px;
  text-transform: uppercase; color: var(--qp-chalk);
  transition: text-shadow 400ms;
}
.qp-standby-mode .qp-title { text-shadow: 0 0 14px rgba(232,37,63,0.45); }
.qp-active-mode  .qp-title { text-shadow: 0 0 16px rgba(30,217,122,0.55); }

/* Status badge */
.qp-status-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; font-weight: 700; letter-spacing: 2px;
  padding: 4px 12px; border-radius: 4px;
  display: inline-flex; align-items: center; gap: 6px;
}
.qp-status-badge.standby {
  color: var(--qp-muted);
  background: rgba(85,96,112,0.10);
  border: 1px solid rgba(85,96,112,0.30);
}
.qp-status-badge.go {
  color: #0a4a26;
  background:
    linear-gradient(180deg, var(--qp-emerald) 0%, var(--qp-jade) 100%);
  border: 1px solid rgba(0,255,156,0.85);
  text-shadow: 0 0 6px rgba(255,255,255,0.6);
  box-shadow:
    0 0 16px rgba(0,255,156,0.55),
    0 0 32px rgba(0,255,156,0.30),
    inset 0 1px 0 rgba(255,255,255,0.4);
  animation: qp-go-pulse 1.8s ease-in-out infinite;
}
@keyframes qp-go-pulse {
  0%,100% {
    box-shadow: 0 0 16px rgba(0,255,156,0.55), 0 0 32px rgba(0,255,156,0.30), inset 0 1px 0 rgba(255,255,255,0.4);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 24px rgba(0,255,156,0.85), 0 0 48px rgba(0,255,156,0.45), inset 0 1px 0 rgba(255,255,255,0.5);
    transform: scale(1.03);
  }
}
.qp-status-icon { font-size: 13px; line-height: 1; }

.qp-session-stat {
  display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
}
.qp-stat-k {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px; color: var(--qp-muted); letter-spacing: 2px;
}
.qp-stat-v {
  font-family: 'Rajdhani', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 1px;
}

.qp-btn-min {
  width: 24px; height: 24px; border-radius: 3px;
  background: var(--qp-card); border: 1px solid rgba(255,255,255,0.10);
  cursor: pointer; color: var(--qp-chalk); font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: all 150ms;
  font-family: 'Rajdhani', sans-serif; font-weight: 900; line-height: 1;
}
.qp-standby-mode .qp-btn-min:hover { background: var(--qp-crimson); border-color: var(--qp-fire); }
.qp-active-mode  .qp-btn-min:hover { background: var(--qp-jade); border-color: var(--qp-emerald); color: #04080a; }

/* ── Conditions banner ── */
.qp-conditions {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  background: rgba(0,0,0,0.45);
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-wrap: wrap;
}
.qp-cond-chip {
  display: flex; gap: 5px; align-items: center;
  padding: 5px 11px; border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 600; letter-spacing: 1px;
  border: 1px solid;
  transition: all 300ms;
}
.qp-cond-chip.ok {
  background: rgba(30,217,122,0.10); border-color: rgba(30,217,122,0.45);
  color: var(--qp-jade); text-shadow: 0 0 8px rgba(30,217,122,0.5);
}
.qp-active-mode .qp-cond-chip.ok {
  background: rgba(30,217,122,0.18); border-color: rgba(0,255,156,0.65);
  box-shadow: 0 0 12px rgba(30,217,122,0.20);
}
.qp-cond-chip.warn {
  background: rgba(255,184,0,0.06); border-color: rgba(255,184,0,0.30);
  color: var(--qp-amber);
}
.qp-cond-chip.no {
  background: rgba(85,96,112,0.08); border-color: rgba(85,96,112,0.25);
  color: var(--qp-muted);
}
.qp-cond-k { color: rgba(255,255,255,0.35); font-size: 9px; }
.qp-cond-v { color: inherit; font-weight: 700; }

.qp-tqi-trend-chip {
  display: flex; align-items: center; gap: 6px;
  flex: 1; min-width: 80px;
}
.qp-tqi-bar-track {
  flex: 1; height: 3px; background: rgba(0,0,0,0.50);
  border-radius: 2px; overflow: hidden; border: 1px solid var(--qp-border);
}
.qp-tqi-bar-fill {
  height: 100%; border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.2,0.8,0.2,1);
  box-shadow: 0 0 8px currentColor;
}
.qp-trend-txt {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
}
.qp-trend-txt.rising  { color: var(--qp-fire); }
.qp-trend-txt.falling { color: var(--qp-amber); }
.qp-trend-txt.stable  { color: var(--qp-muted); }

.qp-blocked {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--qp-amber); letter-spacing: 1px;
  padding: 4px 10px; border-radius: 3px;
  background: rgba(255,184,0,0.06); border: 1px solid rgba(255,184,0,0.25);
  flex-basis: 100%;
}

/* ── Body ── */
.qp-body {
  display: grid;
  grid-template-columns: 220px 1fr 190px;
  gap: 10px;
  padding: 12px 14px 14px;
  min-height: 250px;
}

/* ════════════════════════════════════════════════════════════════
 * TARGET LOCK CARD — La pieza estrella
 * ════════════════════════════════════════════════════════════════ */
.qp-target-card {
  padding: 14px 12px 10px;
  border-radius: 5px;
  position: relative;
  overflow: hidden;
  display: flex; flex-direction: column; gap: 8px;
  transition: all 500ms cubic-bezier(0.4,0,0.2,1);
}

/* DISARMED (STANDBY) */
.qp-target-card.disarmed {
  background:
    radial-gradient(ellipse at center, rgba(232,37,63,0.08) 0%, transparent 70%),
    var(--qp-card);
  border: 1px solid rgba(232,37,63,0.30);
}
.qp-target-card.disarmed::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--qp-crimson), var(--qp-fire), var(--qp-crimson));
  box-shadow: 0 0 10px rgba(232,37,63,0.7);
}

/* ARMED (ACTIVE) — completamente transformado a verde */
.qp-target-card.armed {
  background:
    radial-gradient(ellipse at center, rgba(0,255,156,0.12) 0%, rgba(0,180,90,0.04) 40%, transparent 75%),
    linear-gradient(180deg, #051410 0%, #04080a 100%);
  border: 1px solid rgba(0,255,156,0.55);
  box-shadow:
    inset 0 0 30px rgba(30,217,122,0.10),
    0 0 28px rgba(30,217,122,0.25),
    0 0 60px rgba(30,217,122,0.10);
  animation: qp-target-breathe 2.4s ease-in-out infinite;
}
@keyframes qp-target-breathe {
  0%,100% {
    box-shadow: inset 0 0 30px rgba(30,217,122,0.10), 0 0 28px rgba(30,217,122,0.25), 0 0 60px rgba(30,217,122,0.10);
    border-color: rgba(0,255,156,0.55);
  }
  50% {
    box-shadow: inset 0 0 50px rgba(30,217,122,0.18), 0 0 48px rgba(30,217,122,0.45), 0 0 80px rgba(30,217,122,0.20);
    border-color: rgba(0,255,156,0.85);
  }
}
.qp-target-card.armed::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--qp-jade), var(--qp-emerald), var(--qp-lime), var(--qp-emerald), var(--qp-jade));
  box-shadow: 0 0 14px rgba(0,255,156,0.85);
}

/* Header del target */
.qp-target-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 4px; z-index: 4; position: relative;
}
.qp-target-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; letter-spacing: 3px; font-weight: 700;
  transition: color 400ms, text-shadow 400ms;
}
.qp-target-card.disarmed .qp-target-label { color: var(--qp-fire); text-shadow: 0 0 8px rgba(232,37,63,0.5); }
.qp-target-card.armed .qp-target-label    { color: var(--qp-emerald); text-shadow: 0 0 12px rgba(0,255,156,0.8); }

.qp-target-ccs {
  font-family: 'Rajdhani', sans-serif;
  font-size: 18px; font-weight: 800;
  transition: all 400ms;
}
.qp-target-card.disarmed .qp-target-ccs { color: var(--qp-fire); text-shadow: 0 0 12px rgba(232,37,63,0.7); }
.qp-target-card.armed .qp-target-ccs    { color: var(--qp-shine); text-shadow: 0 0 16px rgba(255,216,96,0.9); }
.qp-target-ccs.pulse { animation: qp-ccs-pulse 1.4s ease-in-out infinite; }
@keyframes qp-ccs-pulse {
  0%,100% { transform: scale(1); }
  50%      { transform: scale(1.08); }
}

/* Categoría */
.qp-target-cat {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 2.5px; font-weight: 700;
  text-transform: uppercase;
  z-index: 4; position: relative;
  transition: color 400ms;
}
.qp-target-card.disarmed .qp-target-cat { color: var(--qp-cyan); text-shadow: 0 0 8px rgba(0,212,255,0.4); }
.qp-target-card.armed .qp-target-cat    { color: var(--qp-lime); text-shadow: 0 0 10px rgba(181,255,77,0.6); }

/* PICK gigante */
.qp-target-pick {
  font-family: 'Rajdhani', sans-serif;
  font-size: 28px; font-weight: 700; text-align: center;
  letter-spacing: 2px; line-height: 1.05;
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  z-index: 4; position: relative;
  padding: 12px 4px;
  transition: all 500ms;
}
.qp-target-card.disarmed .qp-target-pick {
  color: rgba(238,240,245,0.55);
  text-shadow: 1px 1px 3px rgba(0,0,0,0.9);
}
.qp-target-card.armed .qp-target-pick.holographic {
  color: #ffffff;
  text-shadow:
    0 0 10px rgba(0,255,156,0.95),
    0 0 22px rgba(0,255,156,0.70),
    0 0 40px rgba(30,217,122,0.40),
    1px 1px 3px rgba(0,0,0,0.7);
  animation: qp-pick-holo 3s ease-in-out infinite;
}
@keyframes qp-pick-holo {
  0%, 100% {
    text-shadow:
      0 0 10px rgba(0,255,156,0.95),
      0 0 22px rgba(0,255,156,0.70),
      0 0 40px rgba(30,217,122,0.40),
      1px 1px 3px rgba(0,0,0,0.7);
    transform: scale(1);
  }
  50% {
    text-shadow:
      0 0 14px rgba(255,255,255,1),
      0 0 30px rgba(0,255,156,0.95),
      0 0 60px rgba(30,217,122,0.65),
      1px 1px 3px rgba(0,0,0,0.7);
    transform: scale(1.02);
  }
}

/* Scan line — solo cuando armed */
.qp-scan-line {
  position: absolute; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(0,255,156,0.30) 20%,
    rgba(0,255,156,0.95) 50%,
    rgba(0,255,156,0.30) 80%,
    transparent 100%);
  box-shadow: 0 0 14px rgba(0,255,156,0.95), 0 0 28px rgba(0,255,156,0.55);
  animation: qp-scan 2.5s ease-in-out infinite;
  pointer-events: none; z-index: 3;
}
@keyframes qp-scan {
  0%   { top: 20%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 88%; opacity: 0; }
}

/* Esquinas de targeting */
.qp-corner {
  position: absolute;
  width: 14px; height: 14px;
  border: 2px solid var(--qp-emerald);
  z-index: 5; pointer-events: none;
  filter: drop-shadow(0 0 6px rgba(0,255,156,0.9));
  animation: qp-corner-pulse 1.8s ease-in-out infinite;
}
.qp-corner.tl { top: 8px;    left: 8px;   border-right: none; border-bottom: none; }
.qp-corner.tr { top: 8px;    right: 8px;  border-left: none;  border-bottom: none; }
.qp-corner.bl { bottom: 8px; left: 8px;   border-right: none; border-top: none; }
.qp-corner.br { bottom: 8px; right: 8px;  border-left: none;  border-top: none; }
@keyframes qp-corner-pulse {
  0%,100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(0.92); }
}

/* Footer */
.qp-target-footer {
  border-top: 1px solid;
  padding-top: 8px;
  display: flex; flex-direction: column; gap: 6px;
  z-index: 4; position: relative;
  transition: border-color 400ms;
}
.qp-target-card.disarmed .qp-target-footer { border-top-color: rgba(192,21,42,0.20); }
.qp-target-card.armed    .qp-target-footer { border-top-color: rgba(0,255,156,0.30); }

.qp-target-stake {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; font-weight: 700; letter-spacing: 1px;
  text-align: center;
  transition: color 400ms, text-shadow 400ms;
}
.qp-target-card.disarmed .qp-target-stake { color: var(--qp-shine); text-shadow: 0 0 8px rgba(255,216,96,0.4); }
.qp-target-card.armed    .qp-target-stake { color: var(--qp-lime); text-shadow: 0 0 10px rgba(181,255,77,0.6); }

/* Stake input */
.qp-stake-input-row {
  display: flex; align-items: center; gap: 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
}
.qp-level-k { color: var(--qp-muted); letter-spacing: 1px; font-size: 9px; }
.qp-stake-input {
  flex: 1; min-width: 0;
  background: rgba(0,0,0,0.45);
  border: 1px solid;
  border-radius: 3px;
  padding: 4px 8px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700;
  outline: none;
  text-align: right;
  transition: all 200ms;
}
.qp-target-card.disarmed .qp-stake-input {
  border-color: rgba(255,184,0,0.30);
  color: var(--qp-shine);
}
.qp-target-card.armed .qp-stake-input {
  border-color: rgba(181,255,77,0.40);
  color: var(--qp-lime);
}
.qp-stake-input:focus {
  border-color: var(--qp-amber);
  box-shadow: 0 0 10px rgba(255,184,0,0.30);
}
.qp-target-card.armed .qp-stake-input:focus {
  border-color: var(--qp-emerald);
  box-shadow: 0 0 12px rgba(0,255,156,0.35);
}
.qp-stake-cur {
  font-family: 'Rajdhani', sans-serif; font-size: 17px; font-weight: 800;
}

/* ════════════════════════════════════════════════════════════════
 * COL2: Bets Activos + Eficiencia
 * ════════════════════════════════════════════════════════════════ */
.qp-mid-col { display: flex; flex-direction: column; gap: 8px; }

.qp-section-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 2px;
  color: rgba(238,240,245,0.55);
  text-transform: uppercase;
  margin-bottom: 6px; font-weight: 700;
}
.qp-empty {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--qp-muted); text-align: center; padding: 10px;
}

.qp-active-bets {
  background: var(--qp-card); border: 1px solid var(--qp-border);
  border-radius: 4px; padding: 8px 12px;
  transition: border-color 400ms;
}
.qp-active-mode .qp-active-bets {
  background: rgba(15,18,32,0.85);
  border-color: rgba(30,217,122,0.25);
}

.qp-bet-row {
  display: grid; grid-template-columns: 22px 60px 1fr 40px;
  gap: 8px; align-items: center;
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
}
.qp-bet-row:last-child { border-bottom: none; }
.qp-bet-rank { color: var(--qp-muted); font-size: 10px; font-weight: 600; }
.qp-bet-cat  { color: var(--qp-cyan); font-weight: 700; letter-spacing: 1px; font-size: 10px; text-transform: uppercase; }
.qp-active-mode .qp-bet-cat { color: var(--qp-lime); }
.qp-bet-pick { color: var(--qp-chalk); font-weight: 700; font-size: 12px; }
.qp-bet-conf { text-align: right; font-weight: 700; font-size: 12px; }

/* Cat efficiency */
.qp-cat-eff {
  background: var(--qp-card); border: 1px solid var(--qp-border);
  border-radius: 4px; padding: 9px 12px;
  position: relative;
  transition: border-color 400ms;
}
.qp-cat-eff::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--qp-cyan), transparent);
  opacity: 0.3;
}
.qp-active-mode .qp-cat-eff {
  background: rgba(15,18,32,0.85);
  border-color: rgba(30,217,122,0.20);
}
.qp-active-mode .qp-cat-eff::before {
  background: linear-gradient(90deg, transparent, var(--qp-emerald), transparent);
  opacity: 0.55;
}

.qp-cat-strip {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
}
.qp-cat-cell {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 3px; border-radius: 3px;
  background: var(--qp-cardhi); border: 1px solid var(--qp-border);
  font-family: 'JetBrains Mono', monospace;
  transition: all 250ms;
}
.qp-cat-cell.active {
  background: rgba(232,37,63,0.07); border-color: rgba(232,37,63,0.45);
  box-shadow: inset 0 0 12px rgba(232,37,63,0.08);
}
.qp-active-mode .qp-cat-cell.active {
  background: rgba(0,255,156,0.10); border-color: rgba(0,255,156,0.55);
  box-shadow: inset 0 0 14px rgba(0,255,156,0.12), 0 0 12px rgba(0,255,156,0.20);
}
.qp-cat-name { font-size: 10px; font-weight: 700; color: var(--qp-chalk); letter-spacing: 1px; }
.qp-cat-cell.active .qp-cat-name { color: var(--qp-fire); text-shadow: 0 0 8px rgba(232,37,63,0.6); }
.qp-active-mode .qp-cat-cell.active .qp-cat-name { color: var(--qp-emerald); text-shadow: 0 0 10px rgba(0,255,156,0.7); }
.qp-cat-hr { font-family: 'Rajdhani', sans-serif; font-size: 14px; font-weight: 800; }
.qp-cat-wl { font-size: 10px; color: var(--qp-muted); font-weight: 500; }

/* Buckets CCS */
.qp-bucket-strip {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;
}
.qp-bucket-cell {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 6px 3px; border-radius: 3px;
  background: var(--qp-cardhi); border: 1px solid var(--qp-border);
  font-family: 'JetBrains Mono', monospace;
  transition: all 200ms;
}
.qp-bucket-cell.good {
  background: rgba(232,37,63,0.08); border-color: rgba(232,37,63,0.40);
}
.qp-active-mode .qp-bucket-cell.good {
  background: rgba(0,255,156,0.10); border-color: rgba(0,255,156,0.50);
}
.qp-bucket-label {
  font-size: 9px; font-weight: 700; color: rgba(238,240,245,0.55);
  letter-spacing: 0.5px; text-align: center; line-height: 1.2;
}
.qp-bucket-cell.good .qp-bucket-label { color: var(--qp-fire); }
.qp-active-mode .qp-bucket-cell.good .qp-bucket-label { color: var(--qp-emerald); }
.qp-bucket-hr {
  font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 800;
}
.qp-bucket-bar {
  width: 100%; height: 3px; background: rgba(0,0,0,0.50);
  border-radius: 1px; overflow: hidden;
}
.qp-bucket-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--qp-crimson), var(--qp-amber));
  box-shadow: 0 0 4px rgba(232,37,63,0.5);
  transition: width 0.5s cubic-bezier(0.2,0.8,0.2,1);
}
.qp-active-mode .qp-bucket-fill {
  background: linear-gradient(90deg, var(--qp-jade), var(--qp-lime));
  box-shadow: 0 0 6px rgba(0,255,156,0.7);
}

/* ════════════════════════════════════════════════════════════════
 * COL3: Saldo + Próxima + L1-L4
 * ════════════════════════════════════════════════════════════════ */
.qp-right-col { display: flex; flex-direction: column; gap: 8px; }

.qp-tac-cell {
  background: var(--qp-card); border: 1px solid var(--qp-border);
  border-radius: 4px; padding: 11px 13px;
  position: relative; overflow: hidden;
  transition: border-color 400ms;
}
.qp-active-mode .qp-tac-cell {
  background: rgba(15,18,32,0.85);
  border-color: rgba(30,217,122,0.20);
}
.qp-tac-cell::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
}
.qp-tac-cell:nth-child(1)::before { background: var(--qp-fire); box-shadow: 0 0 10px rgba(232,37,63,0.6); }
.qp-tac-cell:nth-child(2)::before { background: var(--qp-amber); box-shadow: 0 0 10px rgba(255,184,0,0.6); }
.qp-active-mode .qp-tac-cell:nth-child(1)::before { background: var(--qp-emerald); box-shadow: 0 0 12px rgba(0,255,156,0.7); }
.qp-active-mode .qp-tac-cell:nth-child(2)::before { background: var(--qp-lime); box-shadow: 0 0 10px rgba(181,255,77,0.6); }

.qp-tac-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 2px; color: rgba(238,240,245,0.55);
  text-transform: uppercase; margin-bottom: 3px; font-weight: 700;
}
.qp-tac-val {
  font-family: 'Rajdhani', sans-serif; font-size: 22px; font-weight: 800;
  color: var(--qp-chalk); letter-spacing: 0.5px; line-height: 1;
}
.qp-tac-sub {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
  margin-top: 3px; letter-spacing: 0.5px;
}

/* L1-L4 */
.qp-levels {
  background: var(--qp-card); border: 1px solid var(--qp-border);
  border-radius: 4px; padding: 9px 12px; flex: 1;
  transition: border-color 400ms;
}
.qp-active-mode .qp-levels {
  background: rgba(15,18,32,0.85);
  border-color: rgba(30,217,122,0.20);
}
.qp-level-strip { display: flex; flex-direction: column; gap: 6px; }
.qp-lvl-cell {
  display: grid; grid-template-columns: 36px 36px 1fr;
  gap: 6px; align-items: center;
  padding: 6px 8px; border-radius: 3px;
  background: var(--qp-cardhi); border: 1px solid var(--qp-border);
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  transition: all 200ms;
}
.qp-lvl-cell.current {
  border-color: rgba(255,184,0,0.55);
  background: rgba(255,184,0,0.06);
  box-shadow: 0 0 12px rgba(255,184,0,0.12);
}
.qp-active-mode .qp-lvl-cell.current {
  border-color: rgba(181,255,77,0.55);
  background: rgba(181,255,77,0.06);
  box-shadow: 0 0 14px rgba(181,255,77,0.15);
}
.qp-lvl-name { color: var(--qp-muted); font-weight: 700; font-size: 10px; }
.qp-lvl-cell.current .qp-lvl-name { color: var(--qp-amber); }
.qp-active-mode .qp-lvl-cell.current .qp-lvl-name { color: var(--qp-lime); }
.qp-lvl-hr { font-family: 'Rajdhani', sans-serif; font-size: 14px; font-weight: 800; text-align: right; }
.qp-lvl-n { color: var(--qp-muted); font-size: 10px; text-align: right; }
.qp-lvl-bar-track {
  grid-column: 1 / -1; height: 2px;
  background: rgba(0,0,0,0.50); border-radius: 1px; overflow: hidden;
}
.qp-lvl-bar-fill {
  height: 100%; border-radius: 1px;
  transition: width 0.5s cubic-bezier(0.2,0.8,0.2,1);
  background: linear-gradient(90deg, var(--qp-crimson), var(--qp-amber));
  box-shadow: 0 0 6px rgba(232,37,63,0.5);
}
.qp-active-mode .qp-lvl-bar-fill {
  background: linear-gradient(90deg, var(--qp-jade), var(--qp-lime));
  box-shadow: 0 0 8px rgba(0,255,156,0.6);
}
.qp-lvl-cell.current .qp-lvl-bar-fill {
  background: linear-gradient(90deg, var(--qp-amber), var(--qp-shine));
  box-shadow: 0 0 10px rgba(255,184,0,0.7);
}

/* ── Colores semánticos globales ── */
.qp-green  { color: var(--qp-jade); text-shadow: 0 0 8px rgba(30,217,122,0.50); }
.qp-amber  { color: var(--qp-amber); text-shadow: 0 0 8px rgba(255,184,0,0.40); }
.qp-red    { color: var(--qp-ember); text-shadow: 0 0 8px rgba(255,68,85,0.45); }
.qp-dim    { color: var(--qp-muted); }
.qp-active { color: var(--qp-emerald); text-shadow: 0 0 10px rgba(0,255,156,0.6); }

/* Bucket W/L texto debajo del % */
.qp-bucket-wl {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 600;
  color: var(--qp-muted);
}
.qp-bucket-cell.good .qp-bucket-wl { color: rgba(238,240,245,0.75); }

/* Ampliar columna stake-base input para que el L1 no se vea apretado */
.qp-stake-cur { min-width: 24px; text-align: center; }
