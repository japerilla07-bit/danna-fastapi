// src/hooks/useDannaEngine.ts
// Orquestador de cola estricta para garantizar procesamiento Spin a Spin en D.A.N.N.A.
import { useState, useRef, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';

// Configuración del Plan (Ajustado según requerimiento de despliegue)
const TRIAL_SPIN_LIMIT = 250; 

interface SpinRequest {
  spin: number;
  notes: string;
}

interface SpinResponse {
  success: boolean;
  spin: number;
  spin_index: number;
  spins_total: number;
  spins_remaining: number;
  state: any;
}

export function useDannaEngine() {
  const [engineState, setEngineState] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [spinsProcessed, setSpinsProcessed] = useState<number>(0);
  
  const spinQueue = useRef<SpinRequest[]>([]);
  const isFlushing = useRef<boolean>(false);

  // Procesador recursivo: Ejecuta estrictamente 1 a 1 esperando la red
  const flushQueue = useCallback(async () => {
    if (isFlushing.current || spinQueue.current.length === 0) return;
    
    isFlushing.current = true;
    setIsProcessing(true);

    while (spinQueue.current.length > 0) {
      // Validación estricta del plan Trial en cliente para evitar sobrecarga de red
      if (spinsProcessed >= TRIAL_SPIN_LIMIT) {
        setError(`Límite del Plan Trial alcanzado (${TRIAL_SPIN_LIMIT} spins). Actualiza para continuar.`);
        spinQueue.current = []; // Vaciar cola
        break;
      }

      const nextSpin = spinQueue.current.shift();
      if (!nextSpin) continue;

      try {
        const response = await fetch('/api/spin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextSpin),
        });

        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status}`);
        }

        const data: SpinResponse = await response.json();
        
        // Actualizamos el estado de D.A.N.N.A de manera atómica
        setEngineState(data.state);
        setSpinsProcessed(data.spins_total);
        setError(null);
        
      } catch (err: any) {
        console.error('[D.A.N.N.A. Core] Fallo en procesamiento de spin:', err);
        setError(err.message || 'Error de conexión con el motor Python.');
        // En caso de fallo crítico, detenemos la cola para no corromper la progresión
        spinQueue.current = [];
        break;
      }
    }

    isFlushing.current = false;
    setIsProcessing(false);
  }, [spinsProcessed]);

  const enqueueSpin = useCallback((spin: number, notes: string = '') => {
    // Apilar petición y disparar el procesamiento si el canal está libre
    spinQueue.current.push({ spin, notes });
    if (!isFlushing.current) {
      flushQueue();
    }
  }, [flushQueue]);

  return {
    engineState,
    isProcessing,
    error,
    spinsProcessed,
    spinsRemaining: TRIAL_SPIN_LIMIT - spinsProcessed,
    enqueueSpin
  };
}