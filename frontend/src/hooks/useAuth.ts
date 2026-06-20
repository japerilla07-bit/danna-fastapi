// Hook de autenticación: encapsula la cuenta actual.
// useAuth() devuelve { user, isLoading, isAuthenticated, refetch }
// Si /api/me responde 401, el usuario no está autenticado.

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export function useAuth() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: (failureCount, error) => {
      // No reintentar en 401 (no autenticado) — eso es esperado
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 2;
    },
    staleTime: 30_000, // /api/me es estable, no refetchar agresivo
  });

  const isAuthenticated = !!query.data && !query.isError;

  return {
    user: query.data,
    isLoading: query.isLoading,
    isAuthenticated,
    error: query.error,
    refetch: query.refetch,
  };
}
