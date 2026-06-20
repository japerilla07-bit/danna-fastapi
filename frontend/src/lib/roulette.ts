// Helpers para representar números de ruleta visualmente.
// Rojos: igual que REDS en danna_core/constants.py

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type SpinColor = 'red' | 'black' | 'green';

export function colorOfSpin(n: number): SpinColor {
  if (n === 0) return 'green';
  if (REDS.has(n)) return 'red';
  return 'black';
}

/** Devuelve clase Tailwind para fondo + texto del chip de un número. */
export function chipClasses(n: number): string {
  const c = colorOfSpin(n);
  if (c === 'green') return 'bg-success text-bg';
  if (c === 'red') return 'bg-fire text-chalk';
  return 'bg-bg border border-border text-chalk';
}

/** Formatea moneda colombiana sin decimales. */
export function formatCOP(amount: number): string {
  return '$' + amount.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/** Convierte un decimal a porcentaje con 1 decimal. */
export function pct(v: number, decimals = 1): string {
  return (v * 100).toFixed(decimals) + '%';
}

/** Mapea status del motor a clase de color. */
export function statusClasses(status: string): { text: string; bg: string; border: string } {
  const s = (status || '').toUpperCase();
  if (s === 'BET') {
    return { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40' };
  }
  if (s === 'PROBE') {
    return { text: 'text-amber', bg: 'bg-amber/10', border: 'border-amber/40' };
  }
  // WAIT / STAND_DOWN / N/A
  return { text: 'text-gray-dim', bg: 'bg-gray-mid/10', border: 'border-gray-mid/40' };
}
