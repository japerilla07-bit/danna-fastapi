// AdminPanel — Lista de usuarios pendientes + acciones de aprobación.
// Vive dentro de la sección "🔴 ADMIN PANEL" del SidebarDrawer (solo plan=admin).
//
// Backend: api_v2/admin_routes.py
//   GET    /api/admin/users?status=pending
//   POST   /api/admin/users/approve   { username, plan }
//   DELETE /api/admin/users/{username}
//
// No usa @/lib/api para no requerir cambios ahí — fetch directo con
// credentials:'include' (mismo patrón que useDannaEngine.ts).

import { useState } from 'react';
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

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function AdminPanel() {
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'pending-users'],
    queryFn: () => fetchJson<UsersResponse>('/api/admin/users?status=pending'),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'pending-users'] });

  const approveMutation = useMutation({
    mutationFn: (vars: { username: string; plan: string }) =>
      fetchJson('/api/admin/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: vars.username, plan: vars.plan }),
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (username: string) =>
      fetchJson(`/api/admin/users/${username}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const pending = data?.users ?? [];
  const plans = data?.plans ?? ['trial', 'daily_pass', 'weekly_pro', 'monthly', 'admin'];

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
      <div className="sidebar-section-title">
        USUARIOS PENDIENTES {data ? `(${data.total})` : ''}
      </div>

      {isLoading && <div className="sidebar-admin-note">Cargando...</div>}

      {error && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          Error: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && pending.length === 0 && (
        <div className="sidebar-admin-note">No hay usuarios pendientes.</div>
      )}

      {pending.map((u) => (
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
            <span className="sidebar-k">CONTACTO</span>
            <span className="sidebar-v" style={{ fontSize: 10 }}>{u.email || '—'}</span>
          </div>
          <div className="sidebar-kv">
            <span className="sidebar-k">REGISTRO</span>
            <span className="sidebar-v" style={{ fontSize: 10 }}>
              {u.created_at ? u.created_at.slice(0, 10) : '—'}
            </span>
          </div>

          <select
            value={selectedPlan[u.username] ?? 'trial'}
            onChange={(e) =>
              setSelectedPlan((s) => ({ ...s, [u.username]: e.target.value }))
            }
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

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="sidebar-action-btn"
              style={{
                background: 'rgba(0,255,156,0.10)',
                border: '1px solid rgba(0,255,156,0.45)',
                color: 'var(--green)',
              }}
              disabled={approveMutation.isPending}
              onClick={() =>
                approveMutation.mutate({
                  username: u.username,
                  plan: selectedPlan[u.username] ?? 'trial',
                })
              }
            >
              {approveMutation.isPending ? '◌ APROBANDO...' : '✅ APROBAR'}
            </button>
            <button
              className="sidebar-action-btn danger"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirm(`¿Eliminar a ${u.username}?`)) {
                  deleteMutation.mutate(u.username);
                }
              }}
            >
              🗑️ ELIMINAR
            </button>
          </div>
        </div>
      ))}

      {approveMutation.isError && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          {(approveMutation.error as Error).message}
        </div>
      )}
      {deleteMutation.isError && (
        <div className="sidebar-admin-note" style={{ color: 'var(--red)' }}>
          {(deleteMutation.error as Error).message}
        </div>
      )}
    </div>
  );
}
