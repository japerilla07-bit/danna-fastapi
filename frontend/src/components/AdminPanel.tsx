// AdminPanel — Gestión COMPLETA de usuarios.
// Vive dentro de la sección "🔴 ADMIN PANEL" del SidebarDrawer (solo plan=admin).
//
// Backend: api_v2/admin_routes.py (ya soporta todo esto, no hay que tocarlo)
//   GET    /api/admin/users[?status=...]
//   POST   /api/admin/users/approve      { username, plan, days? }   ← también RENUEVA (re-setea plan y vencimiento)
//   POST   /api/admin/users/suspend      { username }
//   POST   /api/admin/users/reactivate   { username }                ← solo quita la suspensión, NO renueva el vencimiento
//   POST   /api/admin/users/reset_spins  { username }
//   DELETE /api/admin/users/{username}
//
// PROBLEMA que resuelve: el status queda 'active' aunque el plan haya vencido
// (eso lo decide auth.py, que no se toca). Por eso aquí se detecta el
// vencimiento en el cliente (VENCIDO) y se ofrece RENOVAR = approve con plan,
// que reextiende plan_expires. Hay pestaña VENCIDOS para encontrarlos rápido.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AdminUser {
  username: string;
  email: string;
  status: string;
  plan: string;
  plan_expires: string;
  spins_used_total: number;
  created_at: string;
}

interface UsersResponse {
  total: number;
  users: AdminUser[];
  plans: string[];
}

type Filtro = 'pending' | 'active' | 'suspended' | 'expired' | 'all';

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'pending', label: 'PENDIENTES' },
  { key: 'active', label: 'ACTIVOS' },
  { key: 'expired', label: 'VENCIDOS' },
  { key: 'suspended', label: 'SUSPENDIDOS' },
  { key: 'all', label: 'TODOS' },
];

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/** Vencido = tiene fecha de vencimiento y ya pasó (comparación ISO por string). */
function isExpired(u: AdminUser): boolean {
  const d = (u.plan_expires || '').slice(0, 10);
  return !!d && d < TODAY;
}

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function postJson(path: string, username: string) {
  return fetchJson(`/api/admin/users/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
}

// Estilos de botón inline (sidebar-action-btn no trae color por defecto).
const BTN: Record<string, React.CSSProperties> = {
  approve:    { background: 'rgba(0,255,156,0.10)', border: '1px solid rgba(0,255,156,0.45)', color: 'var(--green)' },
  renew:      { background: 'rgba(0,229,255,0.10)', border: '1px solid rgba(0,229,255,0.50)', color: 'var(--cyan)' },
  reactivate: { background: 'rgba(0,255,156,0.10)', border: '1px solid rgba(0,255,156,0.45)', color: 'var(--green)' },
  suspend:    { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.45)', color: '#fbbf24' },
  reset:      { background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.40)', color: 'var(--txt-md)' },
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#fbbf24',
  active: 'var(--green)',
  suspended: 'var(--red)',
};

export function AdminPanel() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('active');
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetchJson<UsersResponse>('/api/admin/users'),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });

  const approveMutation = useMutation({
    mutationFn: (vars: { username: string; plan: string }) =>
      fetchJson('/api/admin/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: vars.username, plan: vars.plan }),
      }),
    onSuccess: invalidate,
  });

  const suspendMutation = useMutation({
    mutationFn: (username: string) => postJson('suspend', username),
    onSuccess: invalidate,
  });
  const reactivateMutation = useMutation({
    mutationFn: (username: string) => postJson('reactivate', username),
    onSuccess: invalidate,
  });
  const resetMutation = useMutation({
    mutationFn: (username: string) => postJson('reset_spins', username),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (username: string) =>
      fetchJson(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const busy =
    approveMutation.isPending ||
    suspendMutation.isPending ||
    reactivateMutation.isPending ||
    resetMutation.isPending ||
    deleteMutation.isPending;

  const allUsers = data?.users ?? [];
  const plans = data?.plans ?? ['trial', 'daily_pass', 'weekly_pro', 'monthly', 'admin'];

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      pending: 0, active: 0, suspended: 0, all: allUsers.length, expired: 0,
    };
    for (const u of allUsers) {
      c[u.status] = (c[u.status] ?? 0) + 1;
      if (isExpired(u)) c.expired += 1;
    }
    return c;
  }, [allUsers]);

  const visibles =
    filtro === 'all'
      ? allUsers
      : filtro === 'expired'
      ? allUsers.filter(isExpired)
      : allUsers.filter((u) => u.status === filtro);

  const mutErr =
    (approveMutation.error ||
      suspendMutation.error ||
      reactivateMutation.error ||
      resetMutation.error ||
      deleteMutation.error) as Error | null;

  const planFor = (u: AdminUser) => selectedPlan[u.username] ?? (u.plan || 'trial');

  return (
    <div className="sidebar-collapsible-body">
      <div className="sidebar-admin-note">
        Panel de administración disponible. Acceso completo al sistema.
      </div>
      <div className="sidebar-kv">
        <span className="sidebar-k">PLAN</span>
        <span className="sidebar-v" style={{ color: 'var(--red)' }}>ADMIN — ACCESO TOTAL</span>
      </div>

      <div className="sidebar-divider" />

      {/* ── Pestañas ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const on = filtro === f.key;
          const isExp = f.key === 'expired';
          return (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              style={{
                flex: '1 1 auto',
                padding: '5px 6px',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 1,
                background: on
                  ? isExp ? 'rgba(255,45,79,0.14)' : 'rgba(0,229,255,0.12)'
                  : 'rgba(10,16,26,0.40)',
                border: on
                  ? isExp ? '1px solid var(--red)' : '1px solid var(--cyan)'
                  : '1px solid var(--panel-bd)',
                color: on ? (isExp ? 'var(--red)' : 'var(--cyan)') : 'var(--txt-lo)',
              }}
            >
              {f.label} ({counts[f.key] ?? 0})
            </button>
          );
        })}
      </div>

      {isLoading && <div className="sidebar-admin-note">Cargando...</div>}
      {error && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          Error: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && visibles.length === 0 && (
        <div className="sidebar-admin-note">No hay usuarios en esta vista.</div>
      )}

      {visibles.map((u) => {
        const expired = isExpired(u);
        return (
          <div
            key={u.username}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(10, 16, 26, 0.40)',
              border: expired ? '1px solid rgba(255,45,79,0.40)' : '1px solid var(--panel-bd)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div className="sidebar-kv">
              <span className="sidebar-k">USUARIO</span>
              <span className="sidebar-v">{u.username}</span>
            </div>
            <div className="sidebar-kv">
              <span className="sidebar-k">ESTADO</span>
              <span className="sidebar-v" style={{ color: STATUS_COLOR[u.status] ?? 'var(--txt-hi)' }}>
                {(u.status || '—').toUpperCase()}
                {expired && <span style={{ color: 'var(--red)' }}> · VENCIDO</span>}
              </span>
            </div>
            <div className="sidebar-kv">
              <span className="sidebar-k">PLAN</span>
              <span className="sidebar-v" style={{ fontSize: 10, color: expired ? 'var(--red)' : 'var(--txt-hi)' }}>
                {u.plan || '—'}{u.plan_expires ? ` · vence ${u.plan_expires.slice(0, 10)}` : ''}
              </span>
            </div>
            <div className="sidebar-kv">
              <span className="sidebar-k">CONTACTO</span>
              <span className="sidebar-v" style={{ fontSize: 10 }}>{u.email || '—'}</span>
            </div>
            <div className="sidebar-kv">
              <span className="sidebar-k">SPINS</span>
              <span className="sidebar-v" style={{ fontSize: 10 }}>{u.spins_used_total ?? 0}</span>
            </div>
            <div className="sidebar-kv">
              <span className="sidebar-k">REGISTRO</span>
              <span className="sidebar-v" style={{ fontSize: 10 }}>
                {u.created_at ? u.created_at.slice(0, 10) : '—'}
              </span>
            </div>

            {/* Selector de plan — usado por APROBAR (pendiente) y RENOVAR (resto). */}
            <select
              value={planFor(u)}
              onChange={(e) => setSelectedPlan((s) => ({ ...s, [u.username]: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(4,6,10,0.60)',
                border: '1px solid var(--panel-bd)',
                color: 'var(--txt-hi)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              {plans.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {u.status === 'pending' ? (
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.approve, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => approveMutation.mutate({ username: u.username, plan: planFor(u) })}
                >
                  {approveMutation.isPending ? '◌ ...' : '✅ APROBAR'}
                </button>
              ) : (
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.renew, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => approveMutation.mutate({ username: u.username, plan: planFor(u) })}
                  title="Re-aplica el plan y reextiende el vencimiento"
                >
                  {approveMutation.isPending ? '◌ ...' : '↻ RENOVAR'}
                </button>
              )}

              {u.status === 'suspended' && (
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.reactivate, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => reactivateMutation.mutate(u.username)}
                  title="Quita la suspensión (no cambia el vencimiento)"
                >
                  ▶️ REACTIVAR
                </button>
              )}

              {u.status === 'active' && (
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.suspend, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => suspendMutation.mutate(u.username)}
                >
                  ⏸️ SUSPENDER
                </button>
              )}

              <button
                className="sidebar-action-btn"
                style={{ ...BTN.reset, flex: '1 1 45%' }}
                disabled={busy}
                onClick={() => {
                  if (confirm(`¿Resetear los spins de ${u.username}?`)) resetMutation.mutate(u.username);
                }}
              >
                ↺ RESET SPINS
              </button>

              <button
                className="sidebar-action-btn danger"
                style={{ flex: '1 1 45%' }}
                disabled={busy}
                onClick={() => {
                  if (confirm(`¿Eliminar a ${u.username} del historial? No se puede deshacer.`)) {
                    deleteMutation.mutate(u.username);
                  }
                }}
              >
                🗑️ ELIMINAR
              </button>
            </div>
          </div>
        );
      })}

      {mutErr && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          {mutErr.message}
        </div>
      )}
    </div>
  );
}
