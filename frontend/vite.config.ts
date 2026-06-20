import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Alias @ → ./src (matchea tsconfig.json paths)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Build output: queda en backend/frontend_dist/
  // FastAPI lo sirve desde ahí (main.py ya está configurado)
  build: {
    outDir: '../frontend_dist',
    emptyOutDir: true,
  },

  // En desarrollo, proxy /api/* al backend en :8000
  // Así el frontend en :5173 puede llamar /api/login sin CORS
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // mantener cookies: el server seteará 'Set-Cookie' y vite lo reenvía
        cookieDomainRewrite: 'localhost',
      },
    },
  },
});
