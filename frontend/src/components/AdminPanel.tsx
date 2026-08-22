// AdminPanel — Gestión COMPLETA de usuarios.
// Vive dentro de la sección "🔴 ADMIN PANEL" del SidebarDrawer (solo plan=admin).
//
// Backend: api_v2/admin_routes.py (ya soporta todo esto, no hay que tocarlo)
//   GET    /api/admin/users[?status=pending|active|suspended]
//   POST   /api/admin/users/approve      { username, plan, days? }
//   POST   /api/admin/users/suspend      { username }
//   POST   /api/admin/users/reactivate   { username }
//   POST   /api/admin/users/reset_spins  { username }
//   DELETE /api/admin/users/{username}
//
// Trae TODOS los usuarios en una sola query y filtra en cliente, para poder
// mostrar los contadores por pestaña sin pedir varias veces. Las acciones que
// se ofrecen por usuario dependen de SU estado, no de la pestaña seleccionada.
//
// fetch directo con credentials:'include' (mismo patrón que useDannaEngine.ts),
// sin tocar @/lib/api.

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

type Filtro = 'pending' | 'active' | 'suspended' | 'all';

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'pending', label: 'PENDIENTES' },
  { key: 'active', label: 'ACTIVOS' },
  { key: 'suspended', label: 'SUSPENDIDOS' },
  { key: 'all', label: 'TODOS' },
];

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Estilos de botón inline (sidebar-action-btn no trae color por defecto).
const BTN: Record<string, React.CSSProperties> = {
  approve:   { background: 'rgba(0,255,156,0.10)', border: '1px solid rgba(0,255,156,0.45)', color: 'var(--green)' },
  reactivate:{ background: 'rgba(0,255,156,0.10)', border: '1px solid rgba(0,255,156,0.45)', color: 'var(--green)' },
  suspend:   { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.45)', color: '#fbbf24' },
  reset:     { background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.40)', color: 'var(--cyan)' },
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#fbbf24',
  active: 'var(--green)',
  suspended: 'var(--red)',
};

export function AdminPanel() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('pending');
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});

  // Una sola query: TODOS los usuarios. El filtro se aplica en cliente.
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
    mutationFn: (username: string) =>
      fetchJson('/api/admin/users/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      }),
    onSuccess: invalidate,
  });

  const reactivateMutation = useMutation({
    mutationFn: (username: string) =>
      fetchJson('/api/admin/users/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      }),
    onSuccess: invalidate,
  });

  const resetMutation = useMutation({
    mutationFn: (username: string) =>
      fetchJson('/api/admin/users/reset_spins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      }),
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
    const c: Record<string, number> = { pending: 0, active: 0, suspended: 0, all: allUsers.length };
    for (const u of allUsers) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [allUsers]);

  const visibles = filtro === 'all' ? allUsers : allUsers.filter((u) => u.status === filtro);

  const mutErr =
    (approveMutation.error ||
      suspendMutation.error ||
      reactivateMutation.error ||
      resetMutation.error ||
      deleteMutation.error) as Error | null;

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

      {/* ── Pestañas de estado ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const on = filtro === f.key;
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
                background: on ? 'rgba(0,229,255,0.12)' : 'rgba(10,16,26,0.40)',
                border: on ? '1px solid var(--cyan)' : '1px solid var(--panel-bd)',
                color: on ? 'var(--cyan)' : 'var(--txt-lo)',
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

      {visibles.map((u) => (
        <div
          key={u.username}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(10, 16, 26, 0.40)',
            border: '1px solid var(--panel-bd)',
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
            </span>
          </div>
          <div className="sidebar-kv">
            <span className="sidebar-k">PLAN</span>
            <span className="sidebar-v" style={{ fontSize: 10 }}>
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

          {/* Selector de plan — solo cuando se va a aprobar un pendiente */}
          {u.status === 'pending' && (
            <select
              value={selectedPlan[u.username] ?? 'trial'}
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
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.status === 'pending' && (
              <button
                className="sidebar-action-btn"
                style={{ ...BTN.approve, flex: '1 1 45%' }}
                disabled={busy}
                onClick={() =>
                  approveMutation.mutate({
                    username: u.username,
                    plan: selectedPlan[u.username] ?? 'trial',
                  })
                }
              >
                {approveMutation.isPending ? '◌ APROBANDO...' : '✅ APROBAR'}
              </button>
            )}

            {u.status === 'active' && (
              <>
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.suspend, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => suspendMutation.mutate(u.username)}
                >
                  ⏸️ SUSPENDER
                </button>
                <button
                  className="sidebar-action-btn"
                  style={{ ...BTN.reset, flex: '1 1 45%' }}
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`¿Resetear los spins de ${u.username}?`)) {
                      resetMutation.mutate(u.username);
                    }
                  }}
                >
                  ↺ RESET SPINS
                </button>
              </>
            )}

            {u.status === 'suspended' && (
              <button
                className="sidebar-action-btn"
                style={{ ...BTN.reactivate, flex: '1 1 45%' }}
                disabled={busy}
                onClick={() => reactivateMutation.mutate(u.username)}
              >
                ▶️ REACTIVAR
              </button>
            )}

            <button
              className="sidebar-action-btn danger"
              style={{ flex: '1 1 45%' }}
              disabled={busy}
              onClick={() => {
                if (confirm(`¿Eliminar a ${u.username} del historial? Esto no se puede deshacer.`)) {
                  deleteMutation.mutate(u.username);
                }
              }}
            >
              🗑️ ELIMINAR
            </button>
          </div>
        </div>
      ))}

      {mutErr && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          {mutErr.message}
        </div>
      )}
    </div>
  );
}
