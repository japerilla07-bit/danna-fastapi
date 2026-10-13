// BITÁCORA — sincronizador de la jornada abierta con el servidor.
//
// Máquina de estados sin React (reloj, temporizadores, red y navegador se inyectan: es probable al detalle).
//
// Garantías:
//   · Solo dice "guardado en el servidor" cuando el servidor respondió OK a ese contenido.
//   · Cada cambio también se copia al navegador (borrador) como red de seguridad: si el
//     servidor falla, no se pierde nada y se reintenta solo.
//   · Nunca pisa en silencio: si la jornada cambió en otra pantalla/dispositivo (409), se detiene
//     y el usuario elige entre la versión del servidor y la suya.
//   · Un solo guardado en vuelo; si editas mientras se guarda, se envía otro con lo último.
//   · Al cambiar de día se intenta guardar lo pendiente del día anterior; si no se logra, queda
//     en el borrador de ese día y se ofrece al reabrirlo.

import { borrarBorrador, guardarBorradorDoc, leerBorrador, leerBorradorDoc } from './borrador';
import type { Almacen } from './borrador';
import { docIgual, docInicial, normalizarDoc } from './documento';
import type { DocJornada } from './documento';
import type { JornadaServidor, Servicio } from './servicio';

export interface ConflictoInfo { version: number; actualizado: string; doc: DocJornada | null }

export type EstadoSync =
  | { tipo: 'cargando' }
  | { tipo: 'nuevo' }
  | { tipo: 'sincronizado'; guardadoEn: string; version: number }
  | { tipo: 'pendiente' }
  | { tipo: 'guardando' }
  | { tipo: 'error'; mensaje: string; reintentoEnMs?: number }
  | { tipo: 'sin_servidor'; mensaje: string }
  | { tipo: 'conflicto'; servidor: ConflictoInfo }
  | { tipo: 'sin_sesion'; mensaje: string };

export interface Snapshot {
  fecha: string;
  doc: DocJornada;
  /** Versión del servidor sobre la que se parte (0 = la jornada no existe allá). */
  version: number;
  estado: EstadoSync;
  /** Aviso sobre el borrador local (dañado, de otra versión, sin almacenamiento…). */
  avisoBorrador?: string;
  /** Mensaje de que se recuperó trabajo sin enviar de una sesión anterior. */
  recuperado?: boolean;
}

export interface Deps {
  servicio: Servicio;
  almacen: Almacen | null;
  ahora: () => string;
  programar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
  onCambio: (s: Snapshot) => void;
  retardoGuardadoMs?: number;
}

const REINTENTOS_MS = [15000, 30000, 60000];

export class Sincronizador {
  private d: Deps;
  private s: Snapshot;
  private rev = 0;               // sube con cada edición
  private enviada = 0;           // rev del último contenido enviado con éxito
  private enVuelo = false;
  private temporizador: unknown = null;
  private reintento: unknown = null;
  private intentosFallidos = 0;
  private generacion = 0;        // invalida respuestas de un día que ya se cerró
  private plantillaCfg: DocJornada | null = null;

  constructor(deps: Deps, fechaInicial: string) {
    this.d = deps;
    this.s = { fecha: fechaInicial, doc: docInicial(fechaInicial), version: 0, estado: { tipo: 'cargando' } };
  }

  get snapshot(): Snapshot { return this.s; }
  private emitir(p: Partial<Snapshot>): void { this.s = { ...this.s, ...p }; this.d.onCambio(this.s); }
  private sinGuardar(): boolean { return this.rev > this.enviada; }

  // ── Abrir una jornada ──────────────────────────────────────────────────────────
  /** Abre (carga) la jornada de una fecha. `plantilla`: si no existe en ningún lado, se parte de su configuración. */
  async abrir(fecha: string, plantilla?: DocJornada): Promise<void> {
    if (fecha !== this.s.fecha || this.s.estado.tipo !== 'cargando') await this.vaciarPendiente();
    this.limpiarTemporizadores();
    const gen = ++this.generacion;
    this.rev = 0; this.enviada = 0; this.intentosFallidos = 0;
    this.plantillaCfg = plantilla ?? null;
    this.emitir({ fecha, doc: docInicial(fecha), version: 0, estado: { tipo: 'cargando' }, avisoBorrador: undefined, recuperado: undefined });

    const r = await this.d.servicio.leer(fecha);
    if (gen !== this.generacion) return;

    const { borrador, aviso } = leerBorradorDoc(this.d.almacen, fecha, normalizarDoc);
    let local = borrador;
    let avisoBorrador = aviso;
    if (!local) {
      // Migración: borrador anterior (solo plan) guardado antes de que existiera el servidor.
      const viejo = leerBorrador(this.d.almacen);
      const d = viejo.borrador ? normalizarDoc({ cfg: viejo.borrador.cfg, ops: viejo.borrador.ops }) : null;
      if (d && d.cfg.fecha === fecha) {
        local = { v: 2, guardadoEn: viejo.borrador!.guardadoEn, fecha, baseVersion: 0, sincronizado: false, doc: d };
        borrarBorrador(this.d.almacen);
      }
    }

    if (!r.ok) {
      if (r.tipo === 'no_encontrada') return this.cargado(gen, fecha, null, avisoBorrador, local);
      if (r.tipo === 'sin_sesion') {
        const doc = local?.doc ?? this.nuevo(fecha);
        return this.emitir({ doc, version: 0, estado: { tipo: 'sin_sesion', mensaje: r.mensaje }, avisoBorrador, recuperado: !!local && !local.sincronizado });
      }
      const doc = local?.doc ?? this.nuevo(fecha);
      return this.emitir({ doc, version: local?.baseVersion ?? 0, estado: { tipo: 'sin_servidor', mensaje: 'No se pudo leer lo guardado en el servidor. Trabajas con la copia de este navegador; no se enviará hasta que vuelva la conexión.' }, avisoBorrador, recuperado: !!local && !local.sincronizado });
    }

    const srv: JornadaServidor = r.data;
    const docSrv = normalizarDoc(srv.doc);
    if (!docSrv) {
      return this.emitir({ doc: local?.doc ?? this.nuevo(fecha), version: srv.version, estado: { tipo: 'error', mensaje: 'Lo guardado en el servidor para ese día no se pudo leer.' }, avisoBorrador });
    }
    return this.cargado(gen, fecha, { version: srv.version, actualizado: srv.actualizado, doc: docSrv }, avisoBorrador, local);
  }

  private nuevo(fecha: string): DocJornada {
    const base = docInicial(fecha);
    if (!this.plantillaCfg) return base;
    return { ...base, cfg: { ...this.plantillaCfg.cfg, fecha } };
  }

  private cargado(gen: number, fecha: string, srv: ConflictoInfo | null, avisoBorrador: string | undefined, local: ReturnType<typeof leerBorradorDoc>['borrador']): void {
    if (gen !== this.generacion) return;
    const pendienteLocal = local && !local.sincronizado ? local : null;
    if (!srv) {
      const doc = pendienteLocal?.doc ?? this.nuevo(fecha);
      this.emitir({ doc, version: 0, estado: pendienteLocal ? { tipo: 'pendiente' } : { tipo: 'nuevo' }, avisoBorrador, recuperado: !!pendienteLocal });
      if (pendienteLocal) { this.rev = 1; this.programarGuardado(); }
      return;
    }
    if (pendienteLocal && !docIgual(pendienteLocal.doc, srv.doc!)) {
      if (pendienteLocal.baseVersion === srv.version) {
        this.emitir({ doc: pendienteLocal.doc, version: srv.version, estado: { tipo: 'pendiente' }, avisoBorrador, recuperado: true });
        this.rev = 1; this.programarGuardado();
      } else {
        // El servidor avanzó mientras había cambios sin enviar aquí: que decida el usuario.
        this.emitir({ doc: pendienteLocal.doc, version: srv.version, estado: { tipo: 'conflicto', servidor: srv }, avisoBorrador, recuperado: true });
        this.rev = 1;
      }
      return;
    }
    this.emitir({ doc: srv.doc!, version: srv.version, estado: { tipo: 'sincronizado', guardadoEn: srv.actualizado, version: srv.version }, avisoBorrador });
    this.copiaLocal(srv.doc!, srv.version, true);
  }

  // ── Editar ─────────────────────────────────────────────────────────────────────
  /** Aplica un cambio al documento actual. El cambio recibe siempre lo último (sin datos viejos). */
  editar(cambio: (d: DocJornada) => DocJornada): void {
    if (this.s.estado.tipo === 'cargando') return;
    const nuevo = cambio(this.s.doc);
    const doc: DocJornada = { ...nuevo, cfg: { ...nuevo.cfg, fecha: this.s.fecha } };
    if (docIgual(doc, this.s.doc)) return;
    this.rev++;
    const enConflicto = this.s.estado.tipo === 'conflicto';
    this.emitir({ doc, estado: enConflicto ? this.s.estado : this.s.estado.tipo === 'sin_servidor' || this.s.estado.tipo === 'sin_sesion' ? this.s.estado : { tipo: 'pendiente' } });
    this.copiaLocal(doc, this.s.version, false);
    if (!enConflicto && this.s.estado.tipo === 'pendiente') this.programarGuardado();
  }

  private copiaLocal(doc: DocJornada, version: number, sincronizado: boolean): void {
    const r = guardarBorradorDoc(this.d.almacen, this.s.fecha, doc, version, sincronizado, this.d.ahora());
    if (!r.ok) this.s = { ...this.s, avisoBorrador: r.error };
    else if (this.s.avisoBorrador && /no permite|conservó|escribir|espacio/.test(this.s.avisoBorrador)) this.s = { ...this.s, avisoBorrador: undefined };
  }

  // ── Guardar ────────────────────────────────────────────────────────────────────
  private programarGuardado(): void {
    if (this.temporizador !== null) this.d.cancelar(this.temporizador);
    this.temporizador = this.d.programar(() => { this.temporizador = null; void this.guardarAhora(); }, this.d.retardoGuardadoMs ?? 700);
  }

  private limpiarTemporizadores(): void {
    if (this.temporizador !== null) { this.d.cancelar(this.temporizador); this.temporizador = null; }
    if (this.reintento !== null) { this.d.cancelar(this.reintento); this.reintento = null; }
  }

  /** Envía ya lo pendiente (si hay). Devuelve cuando termina el intento. */
  async guardarAhora(forzar = false): Promise<void> {
    if (this.temporizador !== null) { this.d.cancelar(this.temporizador); this.temporizador = null; }
    if (this.reintento !== null) { this.d.cancelar(this.reintento); this.reintento = null; }
    const t = this.s.estado.tipo;
    if (this.enVuelo || t === 'cargando' || t === 'sin_sesion' || (t === 'conflicto' && !forzar) || (!this.sinGuardar() && !forzar)) return;
    this.enVuelo = true;
    const gen = this.generacion, fecha = this.s.fecha, doc = this.s.doc, revEnviada = this.rev;
    this.emitir({ estado: { tipo: 'guardando' } });
    const r = await this.d.servicio.guardar(fecha, this.s.version, doc, forzar);
    this.enVuelo = false;
    if (gen !== this.generacion) return;

    if (r.ok) {
      this.enviada = revEnviada; this.intentosFallidos = 0;
      this.emitir({ version: r.data.version, estado: { tipo: 'sincronizado', guardadoEn: r.data.actualizado, version: r.data.version } });
      if (this.rev > revEnviada) {            // se editó mientras se guardaba
        this.copiaLocal(this.s.doc, r.data.version, false);
        this.emitir({ estado: { tipo: 'pendiente' } });
        this.programarGuardado();
      } else this.copiaLocal(doc, r.data.version, true);
      return;
    }
    if (r.tipo === 'conflicto') {
      const actual = r.actual ?? { version: this.s.version, actualizado: '', doc: null };
      const dsrv = normalizarDoc(actual.doc);
      if (dsrv && docIgual(dsrv, this.s.doc)) {   // otro envío ya dejó exactamente esto
        this.enviada = this.rev;
        this.emitir({ version: actual.version, estado: { tipo: 'sincronizado', guardadoEn: actual.actualizado, version: actual.version } });
        this.copiaLocal(this.s.doc, actual.version, true);
        return;
      }
      return this.emitir({ estado: { tipo: 'conflicto', servidor: { version: actual.version, actualizado: actual.actualizado, doc: dsrv } } });
    }
    if (r.tipo === 'sin_sesion') return this.emitir({ estado: { tipo: 'sin_sesion', mensaje: r.mensaje } });
    if (r.tipo === 'validacion' || r.tipo === 'cuenta') return this.emitir({ estado: { tipo: 'error', mensaje: r.mensaje } });
    // red / servidor: reintento automático con espera creciente; la copia del navegador protege el trabajo
    const espera = REINTENTOS_MS[Math.min(this.intentosFallidos, REINTENTOS_MS.length - 1)];
    this.intentosFallidos++;
    this.emitir({ estado: { tipo: 'error', mensaje: `${r.mensaje} Tus cambios están a salvo en este navegador y se reintenta solo.`, reintentoEnMs: espera } });
    this.reintento = this.d.programar(() => { this.reintento = null; void this.guardarAhora(); }, espera);
  }

  /** Reintento manual (botón). Si nunca se pudo leer del servidor, vuelve a leer. */
  async reintentar(): Promise<void> {
    if (this.s.estado.tipo === 'sin_servidor') return this.abrir(this.s.fecha, this.plantillaCfg ?? undefined);
    if (this.s.estado.tipo === 'error') { this.rev = Math.max(this.rev, this.enviada + 1); }
    return this.guardarAhora();
  }

  /** Resolver un conflicto: quedarse con lo del servidor o sobrescribirlo con lo mío (queda en el historial). */
  async resolver(eleccion: 'servidor' | 'mio'): Promise<void> {
    const e = this.s.estado;
    if (e.tipo !== 'conflicto') return;
    if (eleccion === 'servidor') {
      if (!e.servidor.doc) return;
      this.rev = 0; this.enviada = 0;
      this.emitir({ doc: e.servidor.doc, version: e.servidor.version, estado: { tipo: 'sincronizado', guardadoEn: e.servidor.actualizado, version: e.servidor.version }, recuperado: undefined });
      this.copiaLocal(e.servidor.doc, e.servidor.version, true);
      return;
    }
    this.emitir({ version: e.servidor.version });
    if (this.rev <= this.enviada) this.rev = this.enviada + 1;
    await this.guardarAhora(true);
  }

  /** Antes de cambiar de día o de salir: intenta enviar lo pendiente. */
  async vaciarPendiente(): Promise<void> {
    const t = this.s.estado.tipo;
    if (this.sinGuardar() && (t === 'pendiente' || t === 'error')) await this.guardarAhora();
  }

  /** Desmontar: cancela temporizadores (la copia local ya quedó escrita en cada edición). */
  destruir(): void { this.limpiarTemporizadores(); this.generacion++; }
}
