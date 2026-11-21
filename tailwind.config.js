/** @type {import('tailwindcss').Config} */

// Cores do tema vêm de variáveis CSS (src/index.css): o mesmo componente funciona no tema claro e no escuro.
// Só os tons usados como TEXTO/realce sobre o fundo mudam entre temas; os demais seguem a paleta padrão.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // `dark:` segue o tema escolhido no app (data-theme no <html>), não só o do sistema
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: scale('ink', [950, 900, 850, 800, 700, 600]),
        slate: scale('slate', [50, 100, 200, 300, 400, 500, 600]),
        cyanx: scale('cyanx', [200, 300, 400, 500]),
        amber: scale('amber', [200, 300]),
        red: scale('red', [100, 200, 300]),
        emerald: scale('emerald', [100, 200, 300, 400]),
        sky: scale('sky', [300]),
        orange: scale('orange', [200, 300]),
        /** texto principal (era text-white no tema escuro) */
        fg: v('fg'),
        /** texto sobre botões/selos coloridos (ciano, âmbar) — escuro nos dois temas */
        onaccent: '#04121c',
        /** cartões "folha branca" no estilo do app (branco no claro, painel no escuro) */
        card: v('card'),
        origin: { real: '#22c55e', est: '#38bdf8', sim: '#f59e0b', na: '#64748b' },
        proposal: '#fb923c',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--cyanx-400) / .35), 0 0 18px rgb(var(--cyanx-400) / .15)',
        soft: '0 1px 2px rgb(15 23 42 / .04), 0 8px 24px rgb(15 23 42 / .06)',
      },
    },
  },
  plugins: [],
};
