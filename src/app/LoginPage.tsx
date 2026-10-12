import { useState } from 'react';
import { Button, Field } from '../shared/ui';
import { isNative } from '../platform/native';
import { authErrorMessage, useSession } from './session';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const s = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-safe pb-safe flex min-h-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-md sm:panel sm:p-6">
        <div className="mb-8 text-center">
          <svg viewBox="0 0 32 32" className="mx-auto mb-3 h-14 w-14 drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]">
            <path d="M3 6l13 22L29 6h-6l-7 12L9 6z" fill="none" stroke="#22d3ee" strokeWidth="2" />
          </svg>
          <h1 className="text-xl font-bold tracking-[0.25em] text-white">ELETRICMOTOR</h1>
          <p className="mt-1 text-xs tracking-[0.2em] text-cyanx-400">GÊMEO DIGITAL · VOLTZ EVS</p>
        </div>

        {s.firebaseConfigured ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(s.signInGoogle)}
              className="em-btn flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow transition hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50"
            >
              <GoogleMark />
              Continuar com Google
            </button>

            <div className="my-5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
              <span className="h-px flex-1 bg-ink-700" /> ou com e-mail <span className="h-px flex-1 bg-ink-700" />
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => (mode === 'login' ? s.signInEmail(email, password) : s.signUpEmail(email, password)));
              }}
            >
              <Field label="E-mail">
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Senha">
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button variant="primary" className="w-full" disabled={busy} type="submit">
                {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              </Button>
              <button
                type="button"
                className="w-full py-2 text-xs text-slate-400 hover:text-white"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
              </button>
            </form>
          </>
        ) : (
          <p className="mb-3 rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            Firebase não configurado (.env.local ausente). Use o modo demonstração.
          </p>
        )}

        {err && (
          <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200" role="alert">
            {err}
          </p>
        )}

        <div className="mt-6 border-t border-ink-700 pt-5">
          <Button variant="ghost" className="w-full ring-1 ring-ink-600" onClick={s.enterDemo} data-testid="enter-demo">
            Explorar em modo demonstração
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Sem conta: os registros ficam apenas neste {isNative() ? 'aparelho' : 'navegador'}.
          </p>
        </div>
      </div>
    </div>
  );
}
