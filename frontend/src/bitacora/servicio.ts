// BITÁCORA — cliente HTTP de las jornadas (/api/bitacora/*). Sin React; el fetch se inyecta para poder probarlo.
// Cada respuesta es un resultado tipado: la pantalla nunca tiene que adivinar qué pasó.

export interface JornadaServidor { fecha: string; version: number; actualizado: string; doc: unknown }

export type TipoFallo = 'no_encontrada' | 'conflicto' | 'sin_sesion' | 'cuenta' | 'validacion' | 'red' | 'servidor';
export type Resp<T> = { ok: true; data: T } | { ok: false; tipo: TipoFallo; mensaje: string; actual?: JornadaServidor };

export interface Servicio {
  leer(fecha: string): Promise<Resp<JornadaServidor>>;
  guardar(fecha: string, baseVersion: number, doc: unknown, forzar?: boolean): Promise<Resp<{ version: number; actualizado: string }>>;
  listar(): Promise<Resp<JornadaServidor[]>>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const BASE = '/api/bitacora/jornadas';
const TIMEOUT_MS = 15000;

export function crearServicio(fetchFn: FetchFn = (i, init) => fetch(i, init), timeoutMs = TIMEOUT_MS): Servicio {
  async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<Resp<T>> {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res: Response;
    try {
      res = await fetchFn(ruta, { ...init, credentials: 'include', signal: ctl?.signal, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
    } catch {
      return { ok: false, tipo: 'red', mensaje: 'No hay conexión con el servidor.' };
    } finally { if (t) clearTimeout(t); }
    let cuerpo: any = null;
    try { cuerpo = await res.json(); } catch { /* sin cuerpo JSON */ }
    if (res.ok) {
      return cuerpo === null ? { ok: false, tipo: 'servidor', mensaje: 'Respuesta inesperada del servidor.' } : { ok: true, data: cuerpo as T };
    }
    const detalle = typeof cuerpo?.detail === 'string' ? cuerpo.detail : `Error ${res.status}`;
    if (res.status === 404) return { ok: false, tipo: 'no_encontrada', mensaje: detalle };
    if (res.status === 409) return { ok: false, tipo: 'conflicto', mensaje: 'La jornada cambió en otro lugar.', actual: cuerpo?.actual };
    if (res.status === 401) return { ok: false, tipo: 'sin_sesion', mensaje: 'Tu sesión expiró. Inicia sesión de nuevo.' };
    if (res.status === 403) return { ok: false, tipo: 'cuenta', mensaje: detalle };
    if (res.status === 422) return { ok: false, tipo: 'validacion', mensaje: detalle };
    return { ok: false, tipo: 'servidor', mensaje: 'El servidor no pudo procesar la solicitud.' };
  }

  return {
    leer: (fecha) => llamar<JornadaServidor>(`${BASE}/${encodeURIComponent(fecha)}`),
    guardar: (fecha, baseVersion, doc, forzar = false) =>
      llamar<{ version: number; actualizado: string }>(`${BASE}/${encodeURIComponent(fecha)}`, { method: 'POST', body: JSON.stringify({ base_version: baseVersion, doc, forzar }) }),
    listar: async () => {
      const r = await llamar<{ jornadas: JornadaServidor[] }>(BASE);
      return r.ok ? { ok: true, data: Array.isArray(r.data.jornadas) ? r.data.jornadas : [] } : r;
    },
  };
}
