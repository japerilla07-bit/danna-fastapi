// CALOR RECIENTE (columna derecha, bajo la casilla): 5 mercados + "¿volvió en ≤3
// giros?". Mismos leerCalor()/resumenVolvio() y mismas reglas de estado que MatrixPanel.

import React, { memo } from 'react';
import { useCalor } from '@/store/telemetryStore';
import { leerCalor, resumenVolvio, CALOR_VENTANA, CALOR_VENTANA_DOS, CALOR_VUELTA, type LecturaCalor } from '@/domain/calor';
import { C, FONT_UI, FONT_NUM, neon } from './theme';
import { Lbl, Val } from './ui';

/** Zonas calientes en poco espacio: "Columna 2"+"Columna 3" → "Col 2+3"; docenas/otros: "13-24 + 25-36". */
export function zonasCorto(zonas: string[]): string {
  if (zonas.length > 1 && zonas.every((z) => /^Columna\s+\d$/.test(z))) return `Col ${zonas.map((z) => z.replace(/\D+/g, '')).join('+')}`;
  return zonas.map((z) => z.replace(/Columna\s+/g, 'Col ')).join(' + ');
}

const COLOR_CALIENTE = C.warn;
const COLOR_ENFRIA = '#7fb3d5';
const COLOR_FIN = '#ff8a9a';

export const CalorStrip = memo(function CalorStrip() {
  const calor = useCalor();
  const lecturas: LecturaCalor[] = leerCalor(calor);
  const volvio = resumenVolvio(calor);
  const small = 'calc(var(--qp-fs-txt) - 1px)';
  return (
    <section aria-label="Calor reciente" data-qp="calor" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 1px)', fontWeight: 700, color: C.ink }}>Calor reciente</span>
        <Lbl color={C.ink3}>lo que viene saliendo · últimos {CALOR_VENTANA}-{CALOR_VENTANA_DOS}</Lbl>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lecturas.map((l) => {
          const caliente = l.estado === 'CALIENTE';
          const enfria = l.estado === 'ENFRIANDO';
          const termino = l.estado === 'TERMINO';
          const corto = l.estado === 'CORTO';
          const c = caliente ? COLOR_CALIENTE : enfria ? COLOR_ENFRIA : termino ? COLOR_FIN : C.ink3;
          return (
            <div key={l.mercado} data-qp={`calor-${l.mercado}`} data-estado={l.estado} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 'calc(var(--qp-tbl-row) + 1px)', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: caliente || enfria || termino ? neon(c, 7, 0.8) : undefined }} />
                <Lbl color={C.ink2} style={{ fontSize: 'var(--qp-fs-lbl)', letterSpacing: '0.04em' }}>{l.mercado}</Lbl>
              </span>
              <span data-qp={`calor-${l.mercado}-txt`} style={{ fontFamily: FONT_NUM, fontSize: 'calc(var(--qp-fs-txt) + 0.5px)', fontWeight: 600, letterSpacing: '0.01em', color: c, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {l.estado === 'JUNTANDO' ? `juntando giros ${l.detalle}`
                  : l.estado === 'NORMAL' ? '—'
                  : <>
                      {caliente ? '🔥 ' : enfria ? '❄ ' : corto ? '○ ' : '✖ '}{zonasCorto(l.zonas)}
                      <span style={{ opacity: 0.85, fontWeight: 400 }}>
                        {' · '}{termino ? 'TERMINÓ' : enfria ? 'enfriando' : ''}{termino || enfria ? ' · ' : ''}{l.detalle}
                      </span>
                    </>}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 2 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1.5px)', color: C.ink3, lineHeight: 1.25, display: 'block' }}>
          ¿Volvió en ≤{CALOR_VUELTA} giros? hoy · por azar vuelven ~7 de 10 (1 zona docena/col.), ~9 de 10 (2 zonas) y ~8-9 de 10 (color/rango/paridad)
        </span>
        <div data-qp="calor-volvio" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2, minHeight: 'calc(var(--qp-fs-txt) * 2.6)' }}>
          {volvio.every((v) => v.uno.n === 0 && v.dos.n === 0) ? (
            <span style={{ fontFamily: FONT_UI, fontSize: small, color: C.ink3 }}>— todavía sin calores resueltos</span>
          ) : volvio.map((v) => (
            <span key={v.mercado} style={{ fontFamily: FONT_UI, fontSize: small, color: C.ink2, whiteSpace: 'nowrap' }}>
              {v.mercado}{' '}
              <Val color={C.ink} size={small}>{v.uno.n ? `${v.uno.vol}/${v.uno.n}` : '—'}</Val>
              {(v.mercado === 'DOCENAS' || v.mercado === 'COLUMNAS') && (
                <span style={{ opacity: 0.85 }}> · 2 zonas <Val color={C.ink} size={small}>{v.dos.n ? `${v.dos.vol}/${v.dos.n}` : '—'}</Val></span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});
