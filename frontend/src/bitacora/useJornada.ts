// BITÁCORA — enlaza el sincronizador (sin React) con la pantalla.

import { useCallback, useEffect, useRef, useState } from 'react';
import { almacenNavegador } from './borrador';
import type { DocJornada } from './documento';
import { crearServicio } from './servicio';
import { Sincronizador } from './sincronizador';
import type { Snapshot } from './sincronizador';

export function useJornada(fechaInicial: string) {
  const ref = useRef<Sincronizador | null>(null);
  if (ref.current === null) {
    ref.current = new Sincronizador({
      servicio: crearServicio(), almacen: almacenNavegador(), ahora: () => new Date().toISOString(),
      programar: (fn, ms) => window.setTimeout(fn, ms), cancelar: (id) => window.clearTimeout(id as number),
      onCambio: (s) => setSnap(s),
    }, fechaInicial);
  }
  const sinc = ref.current;
  const [snap, setSnap] = useState<Snapshot>(sinc.snapshot);

  useEffect(() => {
    void sinc.abrir(fechaInicial);
    // Al esconder la pestaña se intenta enviar lo pendiente (la copia del navegador ya está escrita en cada cambio).
    const alOcultar = () => { if (document.visibilityState === 'hidden') void sinc.vaciarPendiente(); };
    document.addEventListener('visibilitychange', alOcultar);
    return () => { document.removeEventListener('visibilitychange', alOcultar); sinc.destruir(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editar = useCallback((cambio: (d: DocJornada) => DocJornada) => sinc.editar(cambio), [sinc]);
  const abrir = useCallback((fecha: string) => sinc.abrir(fecha, sinc.snapshot.doc), [sinc]);
  const reintentar = useCallback(() => sinc.reintentar(), [sinc]);
  const resolver = useCallback((e: 'servidor' | 'mio') => sinc.resolver(e), [sinc]);
  return { snap, editar, abrir, reintentar, resolver };
}
