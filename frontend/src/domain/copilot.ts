// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — COPILOTO: motor de decisión de entrada segura
// ════════════════════════════════════════════════════════════════════════
//
// FILOSOFÍA (no negociable): el sistema NO predice ni persigue win-rate.
// Su trabajo es proteger el bankroll eligiendo BIEN los tiempos de entrada
// para no quedar expuesto en las rachas peligrosas.
//
// Cruza tres señales reales (comprobadas con datos):
//   1. Estado FUSIONADO de la celda (historial + sesión) por mercado.
//   2. Termómetro en vivo (cómo viene la mesa AHORA, últimos giros).
//   3. Racha viva de la celda vs su techo histórico (peligro inminente).
//
// De eso sale UNA decisión clara: mercado, entrar/esperar, y cuánto exponer.
// No es una bola de cristal: es un copiloto que evita los momentos malos.
// ════════════════════════════════════════════════════════════════════════

import type { Zone, Market } from '@/domain/zoneMatrix';

export type Accion = 'ENTRAR' | 'SUAVE' | 'ESPERAR' | 'PARAR';
export type Exposicion = 'NORMAL' | 'REDUCIDA' | 'MÍNIMA' | 'CERO';

export interface MarketRead {
  mkt: Market;
  estado: Zone;              // estado fusionado (historial + hoy)
  cellWr: number | null;     // % histórico de la celda
  termoHits: number;         // aciertos en la ventana
  termoTotal: number;        // giros resueltos en la ventana
  termoStreak: number;       // errores seguidos ahora en la ventana
  liveStreak: number;        // racha viva en la celda actual
  cellCeiling: number | null;// techo histórico de racha de la celda
}

export interface Decision {
  mercado: Market | null;    // a qué mercado ir (null = ninguno)
  accion: Accion;
  exposicion: Exposicion;
  titulo: string;            // línea principal, clara
  motivo: string;            // por qué, en una frase
  nivel: 'ok' | 'precaucion' | 'alto';  // color semáforo
