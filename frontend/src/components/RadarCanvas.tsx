// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Radar cartesiano Entropía × HUD (PixiJS v8 · WebGL)
// ════════════════════════════════════════════════════════════════════════
//
// Renderiza el "mapa de gravedad" de la mesa en tiempo real:
//   • Ejes cartesianos con reticula sutil.
//   • Zonas verdes pintadas como polígonos translúcidos (matriz auditada).
//   • Zonas tóxicas resaltadas (velocity trap, fricción total).
//   • Cola de los últimos giros como puntos + trazo (cometa).
//   • Punto brillante en la posición actual (HUD × ENT).
//
// Rendimiento:
//   • WebGL vía Pixi → 60fps sin sudar, aún con centenas de puntos.
//   • Escenario montado UNA vez; en cada giro solo se actualizan las
//     coordenadas del cometa (mutación local, no re-render React).
//   • React ve este componente como una "caja negra" — el canvas se
//     dibuja solo, React solo lo monta y desmonta.
//
// Contrato de props:
//   • `trail`  — puntos del cometa; el último es la posición actual.
//   • `market` — determina qué celdas verdes pintar (DOC o COL).
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { greenCellsFor, TOXIC_BANDS, type Market } from '@/domain/zoneMatrix';

interface Props {
  /** Últimos giros con coordenadas — el último es la posición actual. */
  trail: Array<{ hud: number; ent: number }>;
  /** Mercado activo (colorea las celdas verdes correspondientes). */
  market: Market;
  /** Ancho del canvas en px. */
  width?: number;
  /** Alto del canvas en px. */
  height?: number;
}

// ────────────────────────────────────────────────────────────────────────
// Constantes visuales
// ────────────────────────────────────────────────────────────────────────

const PADDING = 32;            // margen para ejes y etiquetas
const AXIS_COLOR = 0x475569;   // slate-600
const GRID_COLOR = 0x1e293b;   // slate-800
const LABEL_COLOR = 0x64748b;  // slate-500
const GREEN_FILL = 0x10b981;   // emerald-500
const RED_FILL = 0xdc2626;     // red-600
const TRAIL_COLOR = 0x22d3ee;  // cyan-400
const CURRENT_COLOR = 0x67e8f9;// cyan-300
const CURRENT_HALO = 0x22d3ee;

/**
 * Mapa lineal de coordenadas del dominio (0-100 ent × 0-100 hud) al plano
 * del canvas (px). El eje Y de canvas crece hacia abajo, por eso se invierte HUD.
 */
function makeMapper(w: number, h: number) {
  const innerW = w - PADDING * 2;
  const innerH = h - PADDING * 2;
  return {
    x: (ent: number) => PADDING + (ent / 100) * innerW,
    y: (hud: number) => PADDING + (1 - hud / 100) * innerH,
    innerW,
    innerH,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────

export function RadarCanvas({
  trail,
  market,
  width = 560,
  height = 340,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  // Referencias a las capas — se actualizan por mutación, no por remount.
  const layersRef = useRef<{
    zones: Container | null;
    trail: Graphics | null;
    cursor: Graphics | null;
  }>({ zones: null, trail: null, cursor: null });

  // ── Montaje único del stage Pixi ──────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    const app = new Application();

    (async () => {
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      appRef.current = app;

      // Capa 1: zonas verdes + tóxicas (estático, se dibuja una vez).
      const zones = new Container();
      app.stage.addChild(zones);
      drawZones(zones, market, width, height);
      layersRef.current.zones = zones;

      // Capa 2: ejes y reticula.
      const grid = new Graphics();
      app.stage.addChild(grid);
      drawGrid(grid, width, height);

      // Capa 3: trazo del cometa (dinámico).
      const trailGfx = new Graphics();
      app.stage.addChild(trailGfx);
      layersRef.current.trail = trailGfx;

      // Capa 4: cursor actual (dinámico, glow).
      const cursor = new Graphics();
      app.stage.addChild(cursor);
      layersRef.current.cursor = cursor;

      // Primer pintado del cometa con el trail que ya haya.
      renderTrail(trailGfx, cursor, trail, width, height);
    })();

    return () => {
      cancelled = true;
      const a = appRef.current;
      if (a) {
        a.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      layersRef.current = { zones: null, trail: null, cursor: null };
      // Limpiar el DOM por si Pixi no removió su canvas.
      while (host.firstChild) host.removeChild(host.firstChild);
    };
    // width/height y market son estables por render — cambiarlos remonta.
  }, [width, height, market]);

  // ── Actualización del trail cuando llega giro nuevo ───────────────
  useEffect(() => {
    const { trail: trailGfx, cursor } = layersRef.current;
    if (!trailGfx || !cursor) return;
    renderTrail(trailGfx, cursor, trail, width, height);
  }, [trail, width, height]);

  return (
    <div
      ref={hostRef}
      style={{
        width,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at center, rgba(15,23,42,0.6) 0%, rgba(2,6,23,0.9) 100%)',
        border: '1px solid rgba(34,211,238,0.15)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// Funciones de pintado — puras, no dependen de React
// ────────────────────────────────────────────────────────────────────────

function drawZones(container: Container, mkt: Market, w: number, h: number) {
  const m = makeMapper(w, h);

  // Zonas tóxicas primero (fondo), verdes encima.
  const paintRect = (
    g: Graphics,
    entMin: number,
    entMax: number,
    hudMin: number,
    hudMax: number,
    color: number,
    alpha: number
  ) => {
    const x0 = m.x(entMin);
    const x1 = m.x(entMax);
    const y0 = m.y(hudMax); // hud max = arriba
    const y1 = m.y(hudMin);
    g.rect(x0, y0, x1 - x0, y1 - y0).fill({ color, alpha });
  };

  // Fondo tóxico
  const tox = new Graphics();
  const bands = [
    TOXIC_BANDS.velocityTrap,
    TOXIC_BANDS.totalFriction,
    TOXIC_BANDS.centralChaos,
  ];
  for (const b of bands) {
    paintRect(tox, b.entMin, b.entMax, b.hudMin, b.hudMax, RED_FILL, 0.09);
  }
  container.addChild(tox);

  // Celdas verdes del mercado activo
  const verdes = new Graphics();
  for (const c of greenCellsFor(mkt)) {
    paintRect(verdes, c.entMin, c.entMax, c.hudMin, c.hudMax, GREEN_FILL, 0.18);
  }
  container.addChild(verdes);
}

function drawGrid(g: Graphics, w: number, h: number) {
  const m = makeMapper(w, h);

  // Reticula cada 25 unidades
  for (let v = 0; v <= 100; v += 25) {
    // vertical (Entropía)
    g.moveTo(m.x(v), PADDING);
    g.lineTo(m.x(v), h - PADDING);
    // horizontal (HUD)
    g.moveTo(PADDING, m.y(v));
    g.lineTo(w - PADDING, m.y(v));
  }
  g.stroke({ color: GRID_COLOR, width: 1, alpha: 0.6 });

  // Ejes principales
  const axis = new Graphics();
  axis
    .moveTo(PADDING, h - PADDING)
    .lineTo(w - PADDING, h - PADDING)
    .moveTo(PADDING, PADDING)
    .lineTo(PADDING, h - PADDING)
    .stroke({ color: AXIS_COLOR, width: 1.2, alpha: 0.8 });
  (g.parent as Container).addChild(axis);

  // Etiquetas
  const label = (txt: string, x: number, y: number) => {
    const t = new Text({
      text: txt,
      style: {
        fontFamily: 'monospace',
        fontSize: 9,
        fill: LABEL_COLOR,
        letterSpacing: 1.5,
      },
    });
    t.x = x;
    t.y = y;
    (g.parent as Container).addChild(t);
  };
  label('ENTROPÍA →', w - PADDING - 78, h - PADDING + 12);
  label('↑ HUD', 4, PADDING - 10);
  label('0', PADDING - 6, h - PADDING + 6);
  label('100', w - PADDING - 14, h - PADDING + 6);
  label('100', 4, PADDING + 2);
}

function renderTrail(
  g: Graphics,
  cursor: Graphics,
  trail: Array<{ hud: number; ent: number }>,
  w: number,
  h: number
) {
  g.clear();
  cursor.clear();
  if (trail.length === 0) return;

  const m = makeMapper(w, h);
  const pts = trail.map((p) => ({ x: m.x(p.ent), y: m.y(p.hud) }));

  // Línea del cometa — más brillante cerca del último punto.
  for (let i = 1; i < pts.length; i++) {
    const alpha = (i / pts.length) * 0.6;
    g.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y).stroke({
      color: TRAIL_COLOR,
      width: 1.5,
      alpha,
    });
  }

  // Puntos anteriores — chicos, atenuados.
  for (let i = 0; i < pts.length - 1; i++) {
    const alpha = ((i + 1) / pts.length) * 0.5;
    g.circle(pts[i].x, pts[i].y, 2.2).fill({ color: TRAIL_COLOR, alpha });
  }

  // Cursor actual — punto grande con halo (dos círculos concéntricos).
  const last = pts[pts.length - 1];
  cursor
    .circle(last.x, last.y, 9).fill({ color: CURRENT_HALO, alpha: 0.25 })
    .circle(last.x, last.y, 5).fill({ color: CURRENT_COLOR, alpha: 0.95 })
    .circle(last.x, last.y, 2).fill({ color: 0xffffff, alpha: 1 });
}
