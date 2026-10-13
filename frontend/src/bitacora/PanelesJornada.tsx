// BITÁCORA — paneles de la jornada: resumen del día (con descargas) y lista de mis jornadas.

import type { ReactNode } from 'react';
import { C, FONT_NUM } from '@/components/pilot/theme';
import { fmtCOP } from './CierreSesion';
import type { ResumenJornada } from './registro';

const fmtDur = (m: number): string => (m <= 0 ? '—' : `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ''}${m % 60 ? `${m % 60} min` : ''}`.trim());
export const fechaLarga = (f: string): string => {
  const [y, m, d] = f.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return isNaN(dt.getTime()) ? f : dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const dato = (t: string, v: ReactNode, col: string = C.ink, sub?: string): ReactNode => (
  <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
    <div style={{ fontSize: 11.5, color: C.ink4 }}>{t}</div>
    <div style={{ fontFamily: FONT_NUM, fontSize: 24, fontWeight: 600, lineHeight: '28px', color: col }}>{v}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.ink4, marginTop: 2 }}>{sub}</div>}
  </div>
);

interface ResumenProps {
  resumen: ResumenJornada;
  huerfanos: number[];
  notasDia: string;
  onNotas: (t: string) => void;
  onDescargarDia: () => void;
  onDescargarTodas: () => void;
  onDescargarRespaldo: () => void;
  totalJornadas: number;
}

export function ResumenDia({ resumen: r, huerfanos, notasDia, onNotas, onDescargarDia, onDescargarTodas, onDescargarRespaldo, totalJornadas }: ResumenProps) {
  const res = r.resultadoTotal;
  return (
    <section className="bt-card" aria-label="Resumen de la jornada">
      <h2 className="bt-h">Resumen de la jornada</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
        {dato('Sesiones registradas', `${r.registradas} de ${r.sesionesActivas}`, C.danna, r.pendientes ? `${r.pendientes} sin registrar` : 'todas registradas')}
        {dato('Cumplidas', `${r.cumplidas}`, C.ok, `${r.parciales} a medias · ${r.noCumplidas} no cumplidas`)}
        {dato('Resultado del día', res === null ? '—' : `${res > 0 ? '+' : ''}${fmtCOP(res)}`, res === null ? C.ink4 : res > 0 ? C.ok : res < 0 ? C.err : C.ink, res === null ? 'faltan saldos' : `suma de ${r.sesionesConResultado} sesión(es) con ambos saldos`)}
        {dato('Meta cumplida', `${r.metas.si} de ${r.sesionesActivas}`, C.ok, `${r.metas.no} no · ${r.metas.sinResponder} sin responder`)}
        {dato('Tiempo real jugado', fmtDur(r.tiempoRealMin), C.ink)}
        {dato('Seguiste el motor', `${r.siguioMotor.si}/${r.registradas}`, C.danna, `${r.siguioMotor.parcial} en parte · ${r.siguioMotor.no} no · ${r.siguioMotor.sinResponder} sin responder`)}
        {dato('Salidas de la mesa', `${r.salidasDeMesa}`, r.salidasDeMesa ? C.warn : C.ink)}
        {dato('Cómo te sentiste (prom.)', r.sensacionPromedio === null ? '—' : `${r.sensacionPromedio.toFixed(1)} / 5`, C.ink)}
      </div>
      {huerfanos.length > 0 && (
        <div role="status" style={{ color: C.warn, fontSize: 13.5, marginBottom: 12 }}>
          ⚠ Hay cierres de {huerfanos.map((n) => `S${n}`).join(', ')}, que ya no están en el plan. No entran en este resumen, pero sí en la descarga (como "fuera_del_plan").
        </div>
      )}
      <label className="bt-lbl"><span className="bt-q">Notas del día (para tu retroalimentación al final)</span>
        <textarea className="bt-in" rows={3} maxLength={10000} value={notasDia} onChange={(e) => onNotas(e.target.value)} placeholder="Qué funcionó, qué no, qué cambiarías mañana." /></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" className="bt-btn bt-prim" onClick={onDescargarDia}>Descargar esta jornada (CSV)</button>
        <button type="button" className="bt-btn" onClick={onDescargarTodas}>Descargar todas mis jornadas (CSV){totalJornadas > 1 ? ` · ${totalJornadas}` : ''}</button>
        <button type="button" className="bt-btn" onClick={onDescargarRespaldo}>Respaldo completo (JSON)</button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.ink4 }}>
        El CSV trae una fila por sesión (plan, cierre, saldos, resultado, motor, sensación, salida de mesa y notas) y abre directo en Excel. Los saldos son los que tú escribes: el saldo del motor no se toca.
      </p>
    </section>
  );
}

export interface ItemJornada { fecha: string; registradas: number; activas: number; resultado: number | null }

export function MisJornadas({ items, actual, onAbrir, error }: { items: ItemJornada[]; actual: string; onAbrir: (f: string) => void; error: string | null }) {
  return (
    <section className="bt-card" aria-label="Mis jornadas">
      <h2 className="bt-h">Mis jornadas guardadas</h2>
      {error && <div style={{ color: C.warn, fontSize: 13, marginBottom: 8 }}>⚠ {error}</div>}
      {items.length === 0 ? <div style={{ fontSize: 13.5, color: C.ink3 }}>Todavía no hay jornadas guardadas en el servidor. La de hoy aparece aquí apenas se guarde.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bt-t">
            <thead><tr><th>Día</th><th>Cierres</th><th>Resultado</th><th /></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.fecha} style={it.fecha === actual ? { background: 'rgba(0,229,255,0.05)' } : undefined}>
                  <td>{fechaLarga(it.fecha)}{it.fecha === actual && <span style={{ color: C.danna, fontSize: 12 }}> · abierta</span>}</td>
                  <td>{it.registradas} de {it.activas}</td>
                  <td style={{ color: it.resultado === null ? C.ink4 : it.resultado > 0 ? C.ok : it.resultado < 0 ? C.err : C.ink }}>{it.resultado === null ? '—' : `${it.resultado > 0 ? '+' : ''}${fmtCOP(it.resultado)}`}</td>
                  <td>{it.fecha !== actual && <button type="button" className="bt-btn" onClick={() => onAbrir(it.fecha)}>Abrir</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
