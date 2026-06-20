// LoginPage — Premium cyber (v2).
// Misma identidad visual que el AppPage: red neuronal + telemetría + Michroma.

import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { NeuralBackground } from '@/components/NeuralBackground';
import { Telemetry } from '@/components/Telemetry';
import '@/styles/login.css';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      await api.login(username.trim(), password);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <NeuralBackground />
      <Telemetry />

      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-app">D.A.N.N.A</div>
            <div className="login-sub">Adaptive Neural Engine · 2026</div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {/* Esquinas técnicas (igual que el HUD) */}
            <span className="login-corner login-corner-tl" />
            <span className="login-corner login-corner-tr" />
            <span className="login-corner login-corner-bl" />
            <span className="login-corner login-corner-br" />

            <div className="login-section-title">▸ AUTENTICACIÓN</div>

            <div className="login-field">
              <label>USUARIO</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
              />
            </div>

            <div className="login-field">
              <label>CONTRASEÑA</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>

            {error && <div className="login-error">✗ {error}</div>}

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="login-submit"
            >
              {isLoading ? '◌ CONECTANDO...' : '⏵ ACCEDER'}
            </button>

            <div className="login-footer">v2 · REACT · FASTAPI · DANNA-CORE</div>
          </form>
        </div>
      </div>
    </>
  );
}
