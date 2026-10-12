/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#030a14', 900: '#06101f', 850: '#0a1729', 800: '#0d1d33', 700: '#132a47', 600: '#1c3a5e' },
        cyanx: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4' },
        origin: { real: '#22c55e', est: '#38bdf8', sim: '#f59e0b', na: '#64748b' },
        proposal: '#fb923c',
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'Consolas', 'monospace'] },
      boxShadow: { glow: '0 0 0 1px rgba(34,211,238,.35), 0 0 18px rgba(34,211,238,.15)' },
    },
  },
  plugins: [],
};
