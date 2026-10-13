// Preferencia local "efectos visuales" (botón ✦ del Quantum Pilot). Solo guarda
// 1 bit en este navegador (clave qp_fx, la misma de la v14). Sin dependencias.

import { useSyncExternalStore } from 'react';

const KEY = 'qp_fx';
const subs = new Set<() => void>();
let cache: boolean | null = null;

function leer(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function fxEnabled(): boolean {
  if (cache === null) cache = leer();
  return cache;
}

export function setFxEnabled(v: boolean): void {
  cache = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* sin almacenamiento: queda solo en memoria */ }
  subs.forEach((f) => f());
}

export function subscribeFx(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export function useFxPref(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(subscribeFx, fxEnabled, () => true);
  return [v, setFxEnabled];
}
