import { useState } from 'react';
import { Button, Field } from '../shared/ui';
import { authErrorMessage, useSession } from './session';

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
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="panel w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <svg viewBox="0 0 32 32" className="mx-auto mb-2 h-12 w-12">
            <path d="M3 6l13 22L29 6h-6l-7 12L9 6z" fill="none" stroke="#22d3ee" strokeWidth="2" />
          </svg>
          <h1 className="text-lg font-bold tracking-[0.25em] text-white">ELETRICMOTOR</h1>
          <p className="text-xs tracking-[0.2em] text-cyanx-400">GÊMEO DIGITAL · VOLTZ EVS</p>
        </div>

        {s.firebaseConfigured ? (
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
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
            <Button type="button" className="w-full" disabled={busy} onClick={() => run(s.signInGoogle)}>
              Entrar com Google
            </Button>
            <button
              type="button"
              className="w-full text-xs text-slate-400 hover:text-white"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
            </button>
          </form>
        ) : (
          <p className="mb-3 rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            Firebase não configurado (.env.local ausente). Use o modo demonstração.
          </p>
        )}

        {err && (
          <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200" role="alert">
            {err}
          </p>
        )}

        <div className="my-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
          <span className="h-px flex-1 bg-ink-700" /> ou <span className="h-px flex-1 bg-ink-700" />
        </div>
        <Button className="w-full" onClick={s.enterDemo} data-testid="enter-demo">
          Entrar em modo demonstração (dados locais)
        </Button>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          No modo demonstração os registros ficam apenas neste navegador.
        </p>
      </div>
    </div>
  );
}
