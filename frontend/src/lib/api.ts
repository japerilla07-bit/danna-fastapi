// Cliente HTTP para hablar con el backend de D.A.N.N.A.
// Todas las llamadas pasan 'credentials: include' para que las
// cookies httpOnly (danna_session) viajen automáticamente.

import type {
  LoginResponse,
  UserInfo,
  StateSnapshot,
  SpinResponse,
  Bankroll,
} from '@/types/api';

const API_BASE = ''; // mismo origen — Vite proxy en dev, mismo host en prod

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // sin body json
  }

  if (!res.ok) {
    const detail = body?.detail || `HTTP ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<LoginResponse>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/api/logout', { method: 'POST' }),

  me: () => request<UserInfo>('/api/me'),

  // Estado del usuario (dashboard)
  getState: () => request<StateSnapshot>('/api/state'),
  getSessionState: () =>
    request<{ user_id: string; state: Record<string, unknown> }>(
      '/api/session/state'
    ),
  resetSession: () =>
    request<{ success: boolean; state: Record<string, unknown> }>(
      '/api/session/reset',
      { method: 'POST' }
    ),

  // Spin
  // clientSeq: clave de idempotencia única por disparo. Si el backend ve
  // la misma clave dos veces (retry de red / doble-disparo), ignora el
  // duplicado y no vuelve a contar el giro. Opcional: si no se envía, el
  // backend procesa normal (retrocompatible).
  spin: (spin: number, notes = '', clientSeq?: string) =>
    request<SpinResponse>('/api/spin', {
      method: 'POST',
      body: JSON.stringify({ spin, notes, client_seq: clientSeq }),
    }),

  // Bankroll
  getBankroll: () => request<Bankroll>('/api/bankroll'),
  setBankroll: (amount: number, resetInitial = true) =>
    request<Bankroll>('/api/bankroll/set', {
      method: 'POST',
      body: JSON.stringify({ amount, reset_initial: resetInitial }),
    }),
  adjustBankroll: (delta: number, reason = '') =>
    request<Bankroll>('/api/bankroll/adjust', {
      method: 'POST',
      body: JSON.stringify({ delta, reason }),
    }),
  setStakeBase: (stakeBase: number) =>
    request<Bankroll>('/api/bankroll/stake', {
      method: 'POST',
      body: JSON.stringify({ stake_base: stakeBase }),
    }),
};

export { ApiError };
