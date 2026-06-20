/** @type {import('tailwindcss').Config} */
//
// Esta config NO define colores propios — referencia las CSS variables
// definidas en index.css (que vienen DIRECTO de FUTURISTIC_CSS de app.py).
//
// Eso garantiza que React renderice EXACTAMENTE los mismos colores que
// tu Streamlit, sin recrearlos. Si cambias --cyan en app.py, también
// cambia aquí automáticamente.
//
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: 'var(--void)',
        'bg-base': 'var(--bg-base)',
        'bg-panel': 'var(--bg-panel)',
        'bg-panel2': 'var(--bg-panel2)',
        'bg-panel3': 'var(--bg-panel3)',
        cyan: 'var(--cyan)',
        'cyan-dim': 'var(--cyan-dim)',
        'cyan-ghost': 'var(--cyan-ghost)',
        amber: 'var(--amber)',
        'amber-dim': 'var(--amber-dim)',
        green: 'var(--green)',
        'green-dim': 'var(--green-dim)',
        'red-alert': 'var(--red-alert)',
        'red-dim': 'var(--red-dim)',
        'red-wine': 'var(--red-wine)',
        'txt-primary': 'var(--text-primary)',
        'txt-secondary': 'var(--text-secondary)',
        'txt-dim': 'var(--text-dim)',
        border: 'var(--border)',
        'border-hot': 'var(--border-hot)',
      },
      fontFamily: {
        head: ['Orbitron', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
        ui: ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
