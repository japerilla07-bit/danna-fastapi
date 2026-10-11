// CALOR RECIENTE (nivel 2): 5 mercados + "¿VOLVIÓ EN ≤3 GIROS?". Mismos
// leerCalor()/resumenVolvio() y mismas reglas de estado que MatrixPanel.

import React, { memo } from 'react';
import { useCalor } from '@/store/telemetryStore';
import { leerCalor, resumenVolvio, CALOR_VENTANA, CALOR_VENTANA_DOS, CALOR_VUELTA, type LecturaCalor } from '@/domain/calor';
import { C, FONT_MONO } from './theme';

/** Zonas calientes en poco espacio: "Columna 2"+"Columna 3" → "Col 2+3"; docenas/otros: "13-24 + 25-36". */
export function zonasCorto(zonas: string[]): string {
  if (zonas.length > 1 && zonas.every((z) => /^Columna\s+\d$/.test(z))) return `Col ${zonas.map((z) => z.replace(/\D+/g, '')).join('+')}`;
  return zonas.map((z) => z.replace(/Columna\s+/g, 'Col ')).join(' + ');
}
import { Block, Lbl } from './ui';

const COLOR_CALIENTE = C.warn;
const COLOR_ENFRIA = '#7fb3d5';
const COLOR_FIN = '#ff8a9a';

export const CalorStrip = memo(function CalorStrip() {
  const calor = useCalor();
  const lecturas: LecturaCalor[] = leerCalor(calor);
  const volvio = resumenVolvio(calor);
  return (
    <Block label="Calor reciente" testId="calor" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Lbl color={C.ink2} spacing="0.02em">CALOR RECIENTE · lo que viene saliendo (últimos {CALOR_VENTANA}-{CALOR_VENTANA_DOS})</Lbl>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lecturas.map((l) => {
          const caliente = l.estado === 'CALIENTE';
          const enfria = l.estado === 'ENFRIANDO';
          const termino = l.estado === 'TERMINO';
          const corto = l.estado === 'CORTO';
          const c = caliente ? COLOR_CALIENTE : enfria ? COLOR_ENFRIA : termino ? COLOR_FIN : corto ? C.ink3 : C.ink3;
          return (
            <div key={l.mercado} data-qp={`calor-${l.mercado}`} data-estado={l.estado} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 'var(--qp-row)', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                <span style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-tbl)', color: C.ink2, letterSpacing: '0.08em' }}>{l.mercado}</span>
              </span>
              <span data-qp={`calor-${l.mercado}-txt`} style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: c, textAlign: 'right', whiteSpace: 'nowrap' }}>
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
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.ink3, letterSpacing: '0.04em', fontWeight: 600, lineHeight: 1.25, display: 'block' }}>
          ¿VOLVIÓ EN ≤{CALOR_VUELTA} GIROS? hoy · por azar vuelven ~7 de 10 (1 zona docena/col.), ~9 de 10 (2 zonas) y ~8-9 de 10 (color/rango/paridad)
        </span>
        <div data-qp="calor-volvio" style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 10px', marginTop: 1 }}>
          {volvio.every((v) => v.uno.n === 0 && v.dos.n === 0) ? (
            <span style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-tbl)', color: C.ink3 }}>— todavía sin calores resueltos</span>
          ) : volvio.map((v) => (
            <span key={v.mercado} style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-tbl)', color: C.ink2, whiteSpace: 'nowrap' }}>
              {v.mercado}{' '}
              <b style={{ color: C.ink }}>{v.uno.n ? `${v.uno.vol}/${v.uno.n}` : '—'}</b>
              {(v.mercado === 'DOCENAS' || v.mercado === 'COLUMNAS') && (
                <span style={{ opacity: 0.85 }}> · 2 zonas <b style={{ color: C.ink }}>{v.dos.n ? `${v.dos.vol}/${v.dos.n}` : '—'}</b></span>
              )}
            </span>
          ))}
        </div>
      </div>
    </Block>
  );
});
