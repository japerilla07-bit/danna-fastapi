// Hook central que expone el estado completo del juego.
// Combina /api/state con la mutación de /api/spin.

import { useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useGameState() {
  return useQuery({
    queryKey: ['state'],
    queryFn: () => api.getState(),
    refetchInterval: false,
    staleTime: 1000,
  });
}

type SpinVars = { spin: number; notes?: string };

export function useSpinMutation() {
  const qc = useQueryClient();

  // Candado SÍNCRONO: se activa en el instante del disparo, sin esperar al
  // render. Cierra la ventana de milisegundos en la que `isPending` todavía
  // no se propagó y un doble-clic rápido podía disparar el MISMO giro dos
  // veces (doble conteo de bankroll/progresión).
  const inFlight = useRef(false);
  // Contador para generar una clave de idempotencia única por disparo.
  const seqCounter = useRef(0);

  const mutation = useMutation({
    mutationFn: ({
      spin,
      notes,
      client_seq,
    }: SpinVars & { client_seq: string }) =>
      api.spin(spin, notes || '', client_seq),
    onSuccess: () => {
      // Refrescar /api/state (HUD, radar, top pick, etc) y /api/me (spins remaining)
      qc.invalidateQueries({ queryKey: ['state'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onSettled: () => {
      // Liberar el candado SIEMPRE (éxito o error), una vez sellado el giro.
      inFlight.current = false;
    },
  });

  // `mutate` envuelto: misma firma que el original, así MissionControl.tsx
  // NO necesita cambiar nada. Descarta duplicados en vuelo y adjunta la
  // clave de idempotencia.
  const mutate = useCallback(
    (vars: SpinVars, opts?: Parameters<typeof mutation.mutate>[1]) => {
      if (inFlight.current) {
        // Ya hay un giro en proceso → este disparo es un duplicado, se ignora.
        return;
      }
      inFlight.current = true;
      const client_seq = `${Date.now()}-${++seqCounter.current}`;
      return mutation.mutate({ ...vars, client_seq }, opts as any);
    },
    [mutation]
  );

  return { ...mutation, mutate };
}

export function useResetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetSession(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['state'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
