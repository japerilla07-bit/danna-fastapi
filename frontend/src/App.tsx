// Rutas principales de la app.
// - /         → LandingPage (publico - landing comercial)
// - /login    → LoginPage (publico)
// - /app/bitacora → Planificador de jornada de la bitácora (protegido)
// - /app/*    → AppPage (protegido)
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { AppPage } from '@/pages/AppPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PlanificadorPage } from '@/bitacora/PlanificadorPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app/bitacora"
          element={
            <ProtectedRoute>
              <PlanificadorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <AppPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}