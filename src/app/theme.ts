import { create } from 'zustand';
import { isNative } from '../platform/native';

/**
 * Aparência do app. "claro" é o padrão (estilo app de carro: fundo cinza-azulado e cartões brancos);
 * "escuro" mantém a paleta original; "sistema" segue o celular/computador.
 * Aplica `data-theme` no <html>; as cores vêm de variáveis CSS (src/index.css).
 */
export type ThemePref = 'claro' | 'escuro' | 'sistema';
const KEY = 'em:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'escuro' || v === 'sistema' ? v : 'claro';
  } catch {
    return 'claro';
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const resolve = (p: ThemePref): 'light' | 'dark' =>
  p === 'sistema' ? (media?.matches ? 'dark' : 'light') : p === 'escuro' ? 'dark' : 'light';

function apply(p: ThemePref) {
  const t = resolve(p);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#e6ecf4' : '#030a14');
  if (isNative()) {
    // Barra de status do Android acompanha o tema (ícones escuros no claro)
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        Promise.all([
          StatusBar.setStyle({ style: t === 'light' ? Style.Light : Style.Dark }),
          StatusBar.setBackgroundColor({ color: t === 'light' ? '#e6ecf4' : '#030a14' }),
        ]),
      )
      .catch(() => undefined);
  }
  return t;
}

interface ThemeState {
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref(p: ThemePref): void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: read(),
  resolved: 'light',
  setPref: (p) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* sem storage */
    }
    set({ pref: p, resolved: apply(p) });
  },
}));

/** Chamar uma vez na inicialização. */
export function initTheme() {
  const p = read();
  useTheme.setState({ pref: p, resolved: apply(p) });
  media?.addEventListener?.('change', () => {
    const cur = useTheme.getState().pref;
    if (cur === 'sistema') useTheme.setState({ resolved: apply(cur) });
  });
}
