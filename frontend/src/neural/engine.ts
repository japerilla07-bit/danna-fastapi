// NEURAL INTELLIGENCE LAYER — motor Canvas 2D (sin React, sin dependencias).
//
// Un "escenario" (Stage) dibuja una red orgánica y discreta DETRÁS del contenido
// y responde a eventos REALES del bus:
//   · pulso de luz que sale del componente actualizado y recorre 2-4 conexiones
//     vecinas (solo existe si hubo evento; nunca hay pulsos "de relleno");
//   · borde luminoso sutil sobre ese mismo componente (capa superior, solo
//     opacity; no cubre cifras, no mueve geometría, no captura el puntero).
//
// Presencia: una máscara de densidad (rejilla de 10 px) atenúa la red sobre las
// zonas con mucha información (tablas, carriles, tarjetas) y la deja respirar en
// los espacios libres.
//
// Eficiencia: un único ticker compartido. Sin pulsos activos dibuja a ~15 fps
// con setTimeout (el movimiento es de baja amplitud y periodos de 18-44 s); con
// pulsos pasa a requestAnimationFrame y vuelve al reposo al terminar. Se pausa
// con la pestaña oculta, se adapta al tamaño con ResizeObserver y libera todo en
// destroy(). Con prefers-reduced-motion la red queda quieta y no viajan pulsos
// (el borde luminoso sigue como simple transición de opacidad).

import { onNeural, type NeuralEvent, type Tone, type ToneVoz } from './bus';
import { fxEnabled, subscribeFx } from './prefs';

type C3 = [number, number, number];
const RGB: Record<ToneVoz, C3> = {
  cian: [46, 232, 255], esmeralda: [36, 242, 163], ambar: [255, 200, 61], rojo: [255, 70, 104],
  capa1: [91, 157, 255], escudo: [194, 139, 255],
};
const rgba = (c: C3, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export type Scope = 'page' | 'pilot';
/** Estado REAL de D.A.N.N.A. que tiñe la red (misma prioridad que el borde del panel): racha 4 > racha 3 > GOD BET > espera. */
export type EstadoRed = 'espera' | 'god' | 'alerta3' | 'alerta4';
const LOOK: Record<EstadoRed, { c: C3; sprite: Tone; bri: number }> = {
  espera: { c: RGB.cian, sprite: 'cian', bri: 1 },
  god: { c: RGB.cian, sprite: 'cian', bri: 1.5 },
  alerta3: { c: RGB.ambar, sprite: 'ambar', bri: 1.5 },
  alerta4: { c: RGB.rojo, sprite: 'rojo', bri: 1.6 },
};
/** Lanes que emiten señales hacia la banda de veredicto. */
const CARRILES = ['pilot:lane-real', 'pilot:lane-capa1', 'pilot:lane-escudo'] as const;

export interface StageOptions {
  scope: Scope;
  /** Capa de atrás (canvas). Debe estar posicionada y ocupar todo el escenario. */
  back: HTMLElement;
  /** Capa de adelante (bordes luminosos). Posicionada, encima del contenido, pointer-events: none. */
  front: HTMLElement;
  /** Contenedor donde se buscan zonas densas y componentes objetivo. */
  root: () => ParentNode | null;
  /** Selectores CSS de zonas con alta densidad informativa. */
  dense: string[];
  /** Resuelve el target del evento ("pilot:lane-real", "app:seqlog") a un elemento, o null. */
  resolve: (target: string, root: ParentNode) => Element | null;
}

interface Pulso { pts: number[]; seg: number; x: number; tone: ToneVoz; t0: number; last: number; life: number; piso: number; }

// ── PRNG determinista: el dibujo es siempre el mismo (no cambia en cada recarga) ──
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── Ticker compartido ────────────────────────────────────────────────────────
const stages = new Set<Stage>();
let handle = 0; let handleKind: 'raf' | 'timeout' | null = null;
function cancelTick() { if (handleKind === 'raf') cancelAnimationFrame(handle); else if (handleKind === 'timeout') clearTimeout(handle); handleKind = null; }
function loop() {
  handleKind = null;
  const now = performance.now(); let fluido = false;
  for (const s of stages) { if (s.frame(now)) fluido = true; }
  if (stages.size === 0 || document.hidden) return;
  if (fluido) { handleKind = 'raf'; handle = requestAnimationFrame(loop); } else { handleKind = 'timeout'; handle = window.setTimeout(loop, [...stages].some((s) => s.ambiente()) ? 100 : 400) as unknown as number; }
}
function kick() { if (handleKind === null && !document.hidden && stages.size > 0) { handleKind = 'timeout'; handle = window.setTimeout(loop, 0) as unknown as number; } }
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelTick(); else kick(); });

/** Estadísticas globales para medición (solo lectura). */
/** Diagnóstico: cuántas etapas siguen vivas (debe volver a 0 al desmontar). */
export const liveStages = (): number => stages.size;
export const stats = { frames: 0, drawMs: 0, maxDrawMs: 0, pulsos: 0, glows: 0, ignorados: 0 };

export class Stage {
  private cv: HTMLCanvasElement; private cx: CanvasRenderingContext2D;
  private W = 0; private H = 0; private dpr = 1;
  private bx = new Float32Array(0); private by = new Float32Array(0);
  private ph = new Float32Array(0); private per = new Float32Array(0); private amp = new Float32Array(0);
  private px = new Float32Array(0); private py = new Float32Array(0);
  private pairs: Uint16Array = new Uint16Array(0);
  private adj: number[][] = [];
  private hubs: number[] = [];
  private mask = new Float32Array(0); private mc = 0; private mr = 0; private readonly CELL = 10;
  private maskSig = ''; private maskDirty = true; private lastScan = 0;
  private pulsos: Pulso[] = [];
  private glowsVivos = 0; private ultimoGlow = new Map<string, number>();
  private reducir: boolean; private mq: MediaQueryList | null = null;
  private enabled = fxEnabled();
  private maxD: number; private ampMax: number; private baseLine: number; private baseNode: number; private minPres: number;
  private lastDraw = 0; private seq = 0; private destroyed = false;
  private offs: Array<() => void> = [];
  private halo: Record<ToneVoz, HTMLCanvasElement> | null = null;
  // Tinte de la red según el estado real (transición suave de 1,2 s; sin transición con movimiento reducido)
  private estado: EstadoRed = 'espera'; private tFrom: EstadoRed = 'espera'; private tp = 1; private tT0 = 0;
  private alertaId = 0; private timers = new Set<number>(); private barridos = new Set<HTMLElement>();

  constructor(private o: StageOptions) {
    const pilot = o.scope === 'pilot';
    this.maxD = pilot ? 118 : 190; this.ampMax = pilot ? 9 : 14;
    this.baseLine = pilot ? 0.52 : 0.46; this.baseNode = pilot ? 1.0 : 0.95; this.minPres = pilot ? 0.10 : 0.07;
    this.cv = document.createElement('canvas');
    this.cv.setAttribute('aria-hidden', 'true');
    this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    o.back.appendChild(this.cv);
    this.cx = this.cv.getContext('2d', { alpha: true })!;
    this.mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducir = !!this.mq?.matches;
    const onMq = () => { this.reducir = !!this.mq?.matches; this.pulsos = []; this.forzar(); };
    this.mq?.addEventListener?.('change', onMq); this.offs.push(() => this.mq?.removeEventListener?.('change', onMq));

    const ro = new ResizeObserver(() => { this.layout(); });
    ro.observe(o.back); this.offs.push(() => ro.disconnect());
    const onScroll = () => { this.maskDirty = true; this.forzar(); };
    const scrollTarget: EventTarget = o.scope === 'page' ? window : ((o.root() as Element | null) ?? window);
    scrollTarget.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    this.offs.push(() => { scrollTarget.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions); window.removeEventListener('resize', onScroll); });

    this.offs.push(onNeural((e) => this.onEvent(e)));
    this.offs.push(subscribeFx(() => { this.enabled = fxEnabled(); if (!this.enabled) { this.pulsos = []; this.cx.clearRect(0, 0, this.W, this.H); } this.forzar(); }));

    stages.add(this); this.layout(); kick();
  }

  destroy() {
    this.destroyed = true; stages.delete(this);
    this.offs.forEach((f) => f()); this.offs = [];
    this.timers.forEach((t) => clearTimeout(t)); this.timers.clear(); clearTimeout(this.alertaId);
    this.barridos.forEach((b) => b.remove()); this.barridos.clear();
    this.cv.remove(); this.o.front.textContent = '';
    if (stages.size === 0) cancelTick();
  }

  // ── Layout: nodos deterministas (rejilla con jitter), pares candidatos y máscara ──
  private layout() {
    if (this.destroyed) return;
    const r = this.o.back.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    if (W === this.W && H === this.H && this.bx.length) return;
    this.W = W; this.H = H;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.cv.width = Math.round(W * this.dpr); this.cv.height = Math.round(H * this.dpr);
    this.cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const pilot = this.o.scope === 'pilot';
    const celda = pilot ? 92 : 128;
    const cols = Math.max(2, Math.ceil(W / celda)), rows = Math.max(2, Math.ceil(H / celda));
    const rnd = mulberry(pilot ? 20261012 : 20261013);
    const bx: number[] = [], by: number[] = [], ph: number[] = [], per: number[] = [], amp: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (rnd() < 0.14) continue;                                  // huecos: red orgánica, no cuadrícula
      bx.push(((i + 0.15 + rnd() * 0.7) * W) / cols); by.push(((j + 0.15 + rnd() * 0.7) * H) / rows);
      ph.push(rnd() * 6.283); per.push(18 + rnd() * 26); amp.push(this.ampMax * (0.45 + rnd() * 0.55));
    }
    const n = bx.length;
    this.bx = Float32Array.from(bx); this.by = Float32Array.from(by); this.ph = Float32Array.from(ph);
    this.per = Float32Array.from(per); this.amp = Float32Array.from(amp);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    const lim = this.maxD + 2 * this.ampMax; const pr: number[] = [];
    this.adj = Array.from({ length: n }, () => []);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (Math.hypot(this.bx[a] - this.bx[b], this.by[a] - this.by[b]) < lim) { pr.push(a, b); this.adj[a].push(b); this.adj[b].push(a); }
    }
    this.pairs = Uint16Array.from(pr);
    this.hubs = this.adj.map((v, i) => [v.length, i]).sort((p, q) => q[0] - p[0]).slice(0, Math.max(3, Math.round(n / 9))).map((p) => p[1]);
    this.mc = Math.ceil(W / this.CELL); this.mr = Math.ceil(H / this.CELL); this.mask = new Float32Array(this.mc * this.mr).fill(1);
    this.maskDirty = true; this.maskSig = ''; this.forzar();
  }

  // ── Máscara de densidad: baja la presencia sobre zonas con información ──
  private rescan(now: number): boolean {
    this.lastScan = now;
    const root = this.o.root(); if (!root) return false;
    const hr = this.o.back.getBoundingClientRect();
    const rects: number[][] = [];
    for (const sel of this.o.dense) root.querySelectorAll(sel).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      rects.push([Math.round(r.left - hr.left), Math.round(r.top - hr.top), Math.round(r.right - hr.left), Math.round(r.bottom - hr.top)]);
    });
    const sig = rects.map((r) => r.join(',')).join('|');
    if (sig === this.maskSig && !this.maskDirty) return false;
    this.maskSig = sig; this.maskDirty = false;
    const F = 26, C = this.CELL, m = this.mask; m.fill(1);
    for (const [x0, y0, x1, y1] of rects) {
      const cx0 = Math.max(0, Math.floor((x0 - F) / C)), cx1 = Math.min(this.mc - 1, Math.ceil((x1 + F) / C));
      const cy0 = Math.max(0, Math.floor((y0 - F) / C)), cy1 = Math.min(this.mr - 1, Math.ceil((y1 + F) / C));
      for (let cy = cy0; cy <= cy1; cy++) for (let cxx = cx0; cxx <= cx1; cxx++) {
        const x = cxx * C + C / 2, y = cy * C + C / 2;
        const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1); const d = Math.hypot(dx, dy);
        const f = d <= 0 ? this.minPres : this.minPres + (1 - this.minPres) * Math.min(1, d / F);
        const k = cy * this.mc + cxx; if (f < m[k]) m[k] = f;
      }
    }
    return true;
  }
  /** Luz del pulso en un punto: presencia² → casi nula sobre información, plena en espacio libre. Las señales hacia el veredicto usan un piso (se leen aunque crucen un panel; van detrás del contenido). */
  private luz(x: number, y: number, piso = 0): number { const f = this.presencia(x, y); return piso + (1 - piso) * f * f; }
  private presencia(x: number, y: number): number {
    const cx = Math.min(this.mc - 1, Math.max(0, (x / this.CELL) | 0)), cy = Math.min(this.mr - 1, Math.max(0, (y / this.CELL) | 0));
    return this.mask[cy * this.mc + cx];
  }

  // ── Eventos reales ──
  private onEvent(e: NeuralEvent) {
    if (this.destroyed || !this.enabled || document.hidden) { stats.ignorados++; return; }
    const pre = this.o.scope === 'pilot' ? 'pilot:' : 'app:';
    if (!e.target.startsWith(pre)) return;
    const root = this.o.root(); if (!root) return;
    const now = performance.now();
    if (e.kind === 'senal') {                                   // señal carril → veredicto (D.A.N.N.A. pasó a seguir esa voz)
      if (this.reducir || now - (this.ultimoGlow.get('senal:' + e.target) ?? -1e9) < 700) { stats.ignorados++; return; }
      this.ultimoGlow.set('senal:' + e.target, now);
      this.senal(e.tone, e.target, 'pilot:' + (e.detail ?? 'veredicto'), 2);
      return;
    }
    const el = this.o.resolve(e.target, root); if (!el) return;
    if (now - (this.ultimoGlow.get(e.target) ?? -1e9) < 700) { stats.ignorados++; return; }    // sin ráfagas sobre el mismo componente
    this.ultimoGlow.set(e.target, now);
    const hr = this.o.back.getBoundingClientRect(); const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    this.glow(e.tone as Tone, r.left - hr.left, r.top - hr.top, r.width, r.height, getComputedStyle(el).borderTopLeftRadius || '6px');
    if (!this.reducir) this.lanzar(e.tone, r.left - hr.left, r.top - hr.top, r.width, r.height, now);
    if (e.kind === 'god' && e.detail === 'activo' && !this.reducir) {       // GOD BET se activó: un barrido + una señal desde cada carril
      this.barrido();
      CARRILES.forEach((c, i) => this.later(() => this.senal('cian', c, 'pilot:veredicto', 1), 160 + i * 220));
    }
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => { this.timers.delete(id); if (!this.destroyed && this.enabled && !document.hidden && !this.reducir) fn(); }, ms);
    this.timers.add(id);
  }

  /** UN barrido de luz por la banda de veredicto (1,3 s). Va detrás del contenido; solo transform/opacity. */
  private barrido() {
    const root = this.o.root(); if (!root) return;
    const ver = this.o.resolve('pilot:veredicto', root) as HTMLElement | null; if (!ver) return;
    const sr = this.o.back.getBoundingClientRect(), vr = ver.getBoundingClientRect();
    if (vr.width < 4 || typeof Element.prototype.animate !== 'function') return;
    const cian = RGB.cian; const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;left:0;top:${Math.round(vr.top - sr.top)}px;height:${Math.round(vr.height)}px;width:280px;pointer-events:none;` +
      `background:linear-gradient(90deg,transparent,${rgba(cian, 0.28)} 55%,rgba(255,255,255,.2) 92%,transparent);mix-blend-mode:screen;opacity:0;will-change:transform,opacity`;
    this.o.back.appendChild(bar); this.barridos.add(bar);
    const fin = () => { bar.remove(); this.barridos.delete(bar); };
    const a = bar.animate([{ opacity: 0, transform: 'translateX(-280px)' }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: `translateX(${Math.round(sr.width)}px)` }], { duration: 1300, easing: 'cubic-bezier(.4,0,.2,1)' });
    a.onfinish = fin; a.oncancel = fin; stats.glows++;
  }

  /** Estado real de D.A.N.N.A.: tiñe la red (ámbar racha 3, rojo racha 4, más brillo en GOD BET) y, mientras dura una racha de alerta, repite una señal desde cada carril al veredicto. */
  setEstado(est: EstadoRed) {
    if (this.destroyed || est === this.estado) return;
    this.tFrom = this.estado; this.estado = est; this.tT0 = performance.now();
    this.tp = (this.reducir || !this.enabled) ? 1 : 0;
    clearTimeout(this.alertaId); this.alertaId = 0;
    if ((est === 'alerta3' || est === 'alerta4') && this.o.scope === 'pilot') {
      const cada = est === 'alerta4' ? 3000 : 4200; const tono: ToneVoz = est === 'alerta4' ? 'rojo' : 'ambar';
      const ciclo = () => {
        if (this.destroyed) return;
        if (this.enabled && !document.hidden && !this.reducir) CARRILES.forEach((c, i) => this.later(() => this.senal(tono, c, 'pilot:veredicto', 1), i * 240));
        this.alertaId = window.setTimeout(ciclo, cada);
      };
      this.alertaId = window.setTimeout(ciclo, 350);
    }
    this.forzar();
  }

  /** Señal: nace en la conexión más cercana al carril y avanza hasta 6 saltos por la red HACIA el destino. */
  private senal(tone: ToneVoz, srcT: string, dstT: string, n: number) {
    const root = this.o.root(); if (!root || this.px.length < 4) return;
    const a = this.o.resolve(srcT, root), d = this.o.resolve(dstT, root); if (!a || !d) return;
    const hr = this.o.back.getBoundingClientRect(), ra = a.getBoundingClientRect(), rd = d.getBoundingClientRect();
    if (ra.width < 4 || rd.width < 4) return;
    const now = performance.now(); this.posiciones(now);
    const dx = rd.left + rd.width / 2 - hr.left, dy = rd.top + rd.height / 2 - hr.top;
    const sx = Math.min(Math.max(dx, ra.left - hr.left), ra.right - hr.left), sy = Math.min(Math.max(dy, ra.top - hr.top), ra.bottom - hr.top);   // punto del carril más cercano al veredicto
    const rl = rd.left - hr.left, rt = rd.top - hr.top, rr = rd.right - hr.left, rb = rd.bottom - hr.top;
    // candidatos de salida: los nodos más cercanos al punto del carril que mira al veredicto
    const cand = [...this.px.keys()].filter((i) => this.adj[i].length > 0)
      .sort((p, q) => Math.hypot(this.px[p] - sx, this.py[p] - sy) - Math.hypot(this.px[q] - sx, this.py[q] - sy)).slice(0, n * 3);
    const usados = new Set<number>();
    for (const s0 of cand) {
      if (usados.size >= n || this.pulsos.length >= 8) break;
      const pts = this.ruta(s0, rl, rt, rr, rb); if (pts.length < 2 || usados.has(pts[1])) continue;
      usados.add(pts[1]);
      this.pulsos.push({ pts, seg: 0, x: 0, tone, t0: now, last: now, life: 2800, piso: 0.22 }); stats.pulsos++;
    }
    this.forzar();
  }

  /** Camino más corto (≤7 saltos, solo conexiones válidas) desde un nodo hasta tocar la banda destino; si no llega, el tramo que más se acerca. */
  private ruta(s0: number, rl: number, rt: number, rr: number, rb: number): number[] {
    const dR = (i: number) => Math.hypot(Math.max(rl - this.px[i], 0, this.px[i] - rr), Math.max(rt - this.py[i], 0, this.py[i] - rb));
    const par = new Map<number, number>([[s0, -1]]); let frente = [s0]; let mejor = s0, md = dR(s0);
    const armar = (v: number) => { const r: number[] = []; for (let c = v; c !== -1; c = par.get(c)!) r.push(c); return r.reverse(); };
    for (let prof = 0; prof < 7 && frente.length; prof++) {
      const sig: number[] = [];
      for (const u of frente) for (const v of this.adj[u]) {
        if (par.has(v) || Math.hypot(this.px[v] - this.px[u], this.py[v] - this.py[u]) > this.maxD) continue;
        par.set(v, u); sig.push(v);
        const d = dR(v); if (d < md) { md = d; mejor = v; }
        if (d <= 24) return armar(v);
      }
      frente = sig;
    }
    return armar(mejor);
  }

  /** Borde luminoso: solo opacity (compositor), entra en 240 ms y se apaga en ~1.3 s. */
  private glow(tone: Tone, x: number, y: number, w: number, h: number, radius: string) {
    if (this.glowsVivos >= 6) return;
    const c = RGB[tone]; const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border-radius:${radius};` +
      `border:1px solid ${rgba(c, 0.85)};box-shadow:0 0 12px ${rgba(c, 0.5)},inset 0 0 14px ${rgba(c, 0.18)};opacity:0;pointer-events:none;will-change:opacity`;
    this.o.front.appendChild(d); this.glowsVivos++; stats.glows++;
    const fin = () => { d.remove(); this.glowsVivos = Math.max(0, this.glowsVivos - 1); };
    if (typeof d.animate !== 'function') { d.style.opacity = '0.7'; setTimeout(fin, 1400); return; }
    const a = d.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.17 }, { opacity: 0 }], { duration: 1450, easing: 'ease-out' });
    a.onfinish = fin; a.oncancel = fin;
  }

  /** Pulso: nace en la conexión más cercana al componente y se aleja 2-4 saltos por la red. */
  private lanzar(tone: ToneVoz, x: number, y: number, w: number, h: number, now: number) {
    if (this.pulsos.length >= 8 || this.px.length < 4) return;
    this.posiciones(now);
    const cx = x + w / 2, cy = y + h / 2; let best = -1, bd = Infinity;
    for (let i = 0; i < this.px.length; i++) {
      const dx = Math.max(x - this.px[i], 0, this.px[i] - (x + w)), dy = Math.max(y - this.py[i], 0, this.py[i] - (y + h));
      const d = Math.hypot(dx, dy) + (this.adj[i].length === 0 ? 1e4 : 0) + ((this.seq + i) % 5) * 1.5;   // desempate determinista
      if (d < bd) { bd = d; best = i; }
    }
    this.seq++;
    if (best < 0) return;
    const pts = [best]; const visto = new Set(pts); const largo = 3 + (this.seq % 2);
    for (let k = 0; k < largo; k++) {
      const cur = pts[pts.length - 1]; let nx = -1, nd = -1;
      for (const v of this.adj[cur]) {
        if (visto.has(v)) continue;
        const dd = Math.hypot(this.px[v] - this.px[cur], this.py[v] - this.py[cur]); if (dd > this.maxD) continue;
        const lejos = Math.hypot(this.px[v] - cx, this.py[v] - cy);              // se aleja del componente
        if (lejos > nd) { nd = lejos; nx = v; }
      }
      if (nx < 0) break; pts.push(nx); visto.add(nx);
    }
    if (pts.length < 2) return;
    this.pulsos.push({ pts, seg: 0, x: 0, tone, t0: now, last: now, life: 2300, piso: 0 }); stats.pulsos++;
    this.forzar();
  }

  /** Línea en tramos de ~12 px: cada tramo toma su propia presencia (se apaga sobre zonas densas). */
  private trazo(cx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: C3, alpha: number, piso: number) {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.5 || alpha <= 0.002) return;
    const n = Math.max(1, Math.ceil(L / 12));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, m = (t0 + t1) / 2;
      const f = this.luz(x0 + (x1 - x0) * m, y0 + (y1 - y0) * m, piso);
      cx.strokeStyle = rgba(c, alpha * f); cx.beginPath(); cx.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); cx.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1); cx.stroke();
    }
  }

  /** ¿Este escenario necesita redibujar el movimiento ambiental? (no con efectos apagados ni movimiento reducido) */
  ambiente(): boolean { return this.enabled && !this.reducir; }

  private forzar() { this.lastDraw = 0; kick(); }

  private posiciones(now: number) {
    const t = this.reducir ? 0 : now / 1000;
    for (let i = 0; i < this.px.length; i++) {
      const w = (6.283 / this.per[i]) * t + this.ph[i];
      this.px[i] = this.bx[i] + this.amp[i] * Math.sin(w); this.py[i] = this.by[i] + this.amp[i] * Math.cos(w * 0.83 + this.ph[i]);
    }
  }

  private sprite(tone: ToneVoz): HTMLCanvasElement {
    if (!this.halo) {
      this.halo = {} as Record<ToneVoz, HTMLCanvasElement>;
      (Object.keys(RGB) as ToneVoz[]).forEach((k) => {
        const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d')!;
        const gr = g.createRadialGradient(20, 20, 0, 20, 20, 20); gr.addColorStop(0, rgba(RGB[k], 0.95)); gr.addColorStop(0.18, rgba(RGB[k], 0.5)); gr.addColorStop(1, rgba(RGB[k], 0));
        g.fillStyle = gr; g.fillRect(0, 0, 40, 40); this.halo![k] = c;
      });
    }
    return this.halo[tone];
  }

  /** Un cuadro. Devuelve true si hacen falta cuadros fluidos (hay pulsos vivos). */
  frame(now: number): boolean {
    if (this.destroyed || !this.enabled || this.W === 0) return false;
    if (this.tp < 1) this.tp = Math.min(1, (now - this.tT0) / 1200);
    const activo = this.pulsos.length > 0 || this.tp < 1;
    if ((now - this.lastScan > 2000 || this.maskDirty) && this.rescan(now)) this.lastDraw = 0;   // la máscara cambió → redibujar
    const paso = activo ? 16 : this.reducir ? 1e9 : 100;
    if (this.lastDraw && now - this.lastDraw < paso - 2) return activo;
    this.lastDraw = now;
    const t0 = performance.now();
    this.draw(now);
    const dt = performance.now() - t0; stats.frames++; stats.drawMs += dt; if (dt > stats.maxDrawMs) stats.maxDrawMs = dt;
    return this.pulsos.length > 0 || this.tp < 1;
  }

  private draw(now: number) {
    const cx = this.cx; cx.clearRect(0, 0, this.W, this.H);
    this.posiciones(now);
    // Tinte según el estado real de D.A.N.N.A. (mezcla suave entre el look anterior y el actual)
    const e = this.tp < 1 ? this.tp * this.tp * (3 - 2 * this.tp) : 1; const L0 = LOOK[this.tFrom], L1 = LOOK[this.estado];
    const cian: C3 = [L0.c[0] + (L1.c[0] - L0.c[0]) * e, L0.c[1] + (L1.c[1] - L0.c[1]) * e, L0.c[2] + (L1.c[2] - L0.c[2]) * e].map(Math.round) as C3;
    const bri = L0.bri + (L1.bri - L0.bri) * e; const bl = this.baseLine * bri, bn = Math.min(1, this.baseNode * bri);
    // Conexiones: se agrupan en 4 niveles de opacidad → 4 trazos por cuadro
    const buckets: number[][] = [[], [], [], []]; const pr = this.pairs; const NB = 4;
    for (let k = 0; k < pr.length; k += 2) {
      const a = pr[k], b = pr[k + 1];
      const d = Math.hypot(this.px[a] - this.px[b], this.py[a] - this.py[b]); if (d >= this.maxD) continue;
      const al = (1 - d / this.maxD) * this.baseLine * this.presencia((this.px[a] + this.px[b]) / 2, (this.py[a] + this.py[b]) / 2);
      const lv = Math.min(NB - 1, Math.floor((al / this.baseLine) * NB)); buckets[lv].push(a, b);
    }
    cx.lineWidth = 0.8;
    for (let lv = 0; lv < NB; lv++) {
      const arr = buckets[lv]; if (!arr.length) continue;
      cx.strokeStyle = rgba(cian, Math.min(1, ((lv + 0.5) / NB) * bl)); cx.beginPath();
      for (let k = 0; k < arr.length; k += 2) { cx.moveTo(this.px[arr[k]], this.py[arr[k]]); cx.lineTo(this.px[arr[k + 1]], this.py[arr[k + 1]]); }
      cx.stroke();
    }
    // Nodos: 3 niveles
    const nb: number[][] = [[], [], []];
    for (let i = 0; i < this.px.length; i++) { const f = this.presencia(this.px[i], this.py[i]); nb[f < 0.34 ? 0 : f < 0.75 ? 1 : 2].push(i); }
    for (let lv = 0; lv < 3; lv++) {
      if (!nb[lv].length) continue; cx.fillStyle = rgba(cian, bn * [0.07, 0.5, 1][lv]); cx.beginPath();
      for (const i of nb[lv]) { cx.moveTo(this.px[i] + 1.7, this.py[i]); cx.arc(this.px[i], this.py[i], 1.7, 0, 6.283); }
      cx.fill();
    }
    // Nodos centrales: un halo muy suave (sprite precalculado, sin gradientes por cuadro)
    const s1 = this.sprite(L1.sprite), s0 = this.sprite(L0.sprite); const hb = Math.min(1, bri);
    for (const i of this.hubs) {
      const f = this.presencia(this.px[i], this.py[i]); const al = 0.5 * f * f * hb;
      if (e < 1 && s0 !== s1) { cx.globalAlpha = al * (1 - e); cx.drawImage(s0, this.px[i] - 12, this.py[i] - 12, 24, 24); cx.globalAlpha = al * e; }
      else cx.globalAlpha = al;
      cx.drawImage(s1, this.px[i] - 12, this.py[i] - 12, 24, 24);
    }
    cx.globalAlpha = 1;
    // Pulsos (solo existen si hubo un evento real)
    for (let k = this.pulsos.length - 1; k >= 0; k--) {
      const p = this.pulsos[k]; const age = now - p.t0;
      if (age > p.life || p.seg >= p.pts.length - 1) { this.pulsos.splice(k, 1); continue; }
      const a = p.pts[p.seg], b = p.pts[p.seg + 1]; const L = Math.hypot(this.px[b] - this.px[a], this.py[b] - this.py[a]) || 1;
      const dt = Math.min(50, now - p.last); p.last = now; p.x += (230 * dt / 1000) / L;   // 230 px/s
      if (p.x >= 1) { p.seg++; p.x = 0; if (p.seg >= p.pts.length - 1) { this.pulsos.splice(k, 1); continue; } }
      const a2 = p.pts[p.seg], b2 = p.pts[p.seg + 1];
      const hx = this.px[a2] + (this.px[b2] - this.px[a2]) * p.x, hy = this.py[a2] + (this.py[b2] - this.py[a2]) * p.x;
      const fade = Math.min(1, age / 220) * Math.min(1, (p.life - age) / 600);
      const pres = this.luz(hx, hy, p.piso); const c = RGB[p.tone];
      // tramo recorrido de la conexión actual + el anterior (más tenue); la presencia se evalúa tramo a tramo
      cx.lineCap = 'round'; cx.lineWidth = 1.3;
      this.trazo(cx, this.px[a2], this.py[a2], hx, hy, c, 0.6 * fade, p.piso);
      if (p.seg > 0) { const z = p.pts[p.seg - 1]; this.trazo(cx, this.px[z], this.py[z], this.px[a2], this.py[a2], c, 0.22 * fade, p.piso); }
      cx.globalAlpha = fade * pres; cx.drawImage(this.sprite(p.tone), hx - 10, hy - 10, 20, 20); cx.globalAlpha = 1;
    }
  }
}

export function createStage(o: StageOptions): Stage { return new Stage(o); }
