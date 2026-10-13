// CALOR RECIENTE (columna derecha, bajo la casilla): 5 mercados + "¿volvió en ≤3
// giros?". Mismos leerCalor()/resumenVolvio() y mismas reglas de estado que MatrixPanel.

import React, { memo } from 'react';
import { useCalor } from '@/store/telemetryStore';
import { leerCalor, resumenVolvio, CALOR_VENTANA, CALOR_VENTANA_DOS, CALOR_VUELTA, CALOR_MIN_CONFIRMA, type LecturaCalor } from '@/domain/calor';
import { C, FONT_UI, FONT_NUM, rgba, glowText } from './theme';
import { Lbl, Val } from './ui';

/** Zonas calientes en poco espacio: "Columna 2"+"Columna 3" → "Col 2+3"; docenas/otros: "13-24 + 25-36". */
export function zonasCorto(zonas: string[]): string {
  if (zonas.length > 1 && zonas.every((z) => /^Columna\s+\d$/.test(z))) return `Col ${zonas.map((z) => z.replace(/\D+/g, '')).join('+')}`;
  return zonas.map((z) => z.replace(/Columna\s+/g, 'Col ')).join(' + ');
}

const COLOR_CALIENTE = C.warn;
const COLOR_ENFRIA = '#7fb3d5';
const COLOR_FIN = '#ff8a9a';

/** Nombre del mercado en palabras de usuario. */
const NOMBRE: Record<string, string> = { DOCENAS: 'Docenas', COLUMNAS: 'Columnas', COLOR: 'Color', RANGO: 'Rango', PARIDAD: 'Paridad' };

/** Zonas sin espacios de más: "13-24+25-36", "Col 2+3". */
function zonasPegadas(zonas: string[]): string {
  return zonasCorto(zonas).replace(/ \+ /g, '+');
}

/** Zonas de cada mercado de 3 zonas (mismos nombres que domain/calor.ts). */
const ZONAS_DE: Record<string, string[] | undefined> = { DOCENAS: ['1-12', '13-24', '25-36'], COLUMNAS: ['Columna 1', 'Columna 2', 'Columna 3'] };

/** Segunda línea de cada mercado, en lenguaje llano (solo presentación; los números salen de leerCalor). */
function explicacion(l: LecturaCalor): string {
  const n = l.duracion ?? 0;
  const h = l.aciertos ?? 0;
  switch (l.estado) {
    case 'CALIENTE': {
      if (n === 0) {
        const m = /^(\d+) de (\d+)$/.exec(l.detalle);
        // Dos zonas calientes (docenas/columnas): lo que define el calor es que la TERCERA zona no salió.
        // Se dice así porque "salió 9 de 9" entre dos de tres zonas suena a trivial.
        const todas = ZONAS_DE[l.mercado];
        if (m && todas && l.zonas.length === 2) {
          const falta = todas.filter((z) => !l.zonas.includes(z));
          if (falta.length === 1) return `Caliente · ${zonasCorto(falta)} no salió en los últimos ${m[2]} giros`;
        }
        return m ? `Caliente · salió ${m[1]} de los últimos ${m[2]} giros` : `Caliente · ${l.detalle}`;
      }
      return n < CALOR_MIN_CONFIRMA ? `Por confirmar · desde entonces cayó ${h} de ${n}` : `Caliente · desde entonces cayó ${h} de ${n} giros`;
    }
    case 'ENFRIANDO': return `Enfriándose · desde entonces cayó ${h} de ${n} ${n === 1 ? 'giro' : 'giros'}`;
    case 'TERMINO': return `Terminó · duró ${n} giros, cayó ${h} de ${n}`;
    case 'CORTO': return `Se apagó a los ${n} giros · no cuenta`;
    case 'JUNTANDO': return `Necesita ${CALOR_VENTANA} giros · van ${l.detalle.split('/')[0]}`;
    default: return 'Nada fuera de lo normal';
  }
}

export const CalorStrip = memo(function CalorStrip() {
  const calor = useCalor();
  const lecturas: LecturaCalor[] = leerCalor(calor);
  const volvio = resumenVolvio(calor);
  const small = 'calc(var(--qp-fs-txt) - 1px)';
  return (
    <section aria-label="Calor reciente" data-qp="calor" style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 1px)', fontWeight: 700, color: C.ink }}>Calor reciente</span>
        <Lbl color={C.ink3}>zonas que salen de más · últimos {CALOR_VENTANA}-{CALOR_VENTANA_DOS} giros</Lbl>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lecturas.map((l) => {
          const caliente = l.estado === 'CALIENTE';
          const enfria = l.estado === 'ENFRIANDO';
          const termino = l.estado === 'TERMINO';
          const corto = l.estado === 'CORTO';
          const activo = caliente || enfria || termino || corto;
          const c = caliente ? COLOR_CALIENTE : enfria ? COLOR_ENFRIA : termino ? COLOR_FIN : C.ink3;
          const glifo = caliente ? '🔥' : enfria ? '❄' : corto ? '○' : '✖';
          return (
            <div key={l.mercado} data-qp={`calor-${l.mercado}`} data-estado={l.estado} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(var(--qp-fs-txt) * 2.1)', borderBottom: `1px solid ${C.line}`, borderLeft: `2px solid ${activo ? c : 'transparent'}`, paddingLeft: 5, background: activo ? `linear-gradient(90deg, ${rgba(c, 0.14)}, transparent 80%)` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, lineHeight: 1.1 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)', fontWeight: activo ? 700 : 500, color: activo ? C.ink : C.ink2 }}>{NOMBRE[l.mercado]}</span>
                <span data-qp={`calor-${l.mercado}-zona`} style={{ fontFamily: FONT_NUM, fontSize: 'calc(var(--qp-fs-txt) + 0.5px)', fontWeight: 700, color: c, whiteSpace: 'nowrap', textShadow: caliente ? glowText(c, 0.5) : undefined }}>
                  {l.estado === 'JUNTANDO' ? <span style={{ fontWeight: 400 }}>reuniendo giros</span>
                    : l.estado === 'NORMAL' ? <span style={{ fontWeight: 400 }}>sin calor</span>
                    : <>{glifo} {zonasPegadas(l.zonas)}</>}
                </span>
              </div>
              <span data-qp={`calor-${l.mercado}-txt`} style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1.5px)', lineHeight: 1.1, color: activo ? c : C.ink4, whiteSpace: 'nowrap', opacity: activo ? 0.95 : 1 }}>
                {explicacion(l)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 1 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: small, fontWeight: 600, color: C.ink2, lineHeight: 1.25, display: 'block' }}>
          Tras calentarse, ¿volvió a salir en {CALOR_VUELTA} giros? <span style={{ fontWeight: 400, color: C.ink3 }}>(hoy)</span>
        </span>
        <span data-qp="calor-leyenda" style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1.5px)', color: C.ink3, lineHeight: 1.25, display: 'block' }}>
          Por azar: ~7 de 10 · con 2 zonas ~9 · color, rango, paridad ~8-9
        </span>
        <div data-qp="calor-volvio" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2, minHeight: 'calc(var(--qp-fs-txt) * 2.5)' }}>
          {volvio.every((v) => v.uno.n === 0 && v.dos.n === 0) ? (
            <span style={{ fontFamily: FONT_UI, fontSize: small, color: C.ink3 }}>— todavía sin calores terminados hoy</span>
          ) : volvio.map((v) => (
            <span key={v.mercado} style={{ fontFamily: FONT_UI, fontSize: small, color: C.ink2, whiteSpace: 'nowrap' }}>
              {NOMBRE[v.mercado]}{' '}
              <Val color={C.ink} size={small}>{v.uno.n ? `${v.uno.vol} de ${v.uno.n}` : '—'}</Val>
              {(v.mercado === 'DOCENAS' || v.mercado === 'COLUMNAS') && (
                <span style={{ opacity: 0.85 }}> · 2 zonas <Val color={C.ink} size={small}>{v.dos.n ? `${v.dos.vol} de ${v.dos.n}` : '—'}</Val></span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});
