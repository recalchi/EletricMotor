import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../data/firebase';
import { FirestoreRepository, LocalRepository, type Repository } from '../data/repository';

export const VEHICLE_ID = 'evs-1';
const DEMO_KEY = 'em:demo-session';

export interface Session {
  mode: 'demo' | 'firebase';
  uid: string;
  displayName: string;
  email: string | null;
}

interface SessionCtx {
  session: Session | null;
  loading: boolean;
  repo: Repository | null;
  firebaseConfigured: boolean;
  enterDemo(): void;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  signInGoogle(): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

function readDemo(): Session | null {
  try {
    return localStorage.getItem(DEMO_KEY)
      ? { mode: 'demo', uid: 'demo', displayName: 'Demonstração', email: null }
      : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readDemo);
  const [loading, setLoading] = useState(firebaseConfigured && !readDemo());

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u: User | null) => {
      if (u)
        setSession({
          mode: 'firebase',
          uid: u.uid,
          displayName: u.displayName ?? u.email ?? 'Usuário',
          email: u.email,
        });
      else setSession((s) => (s?.mode === 'firebase' ? null : s));
      setLoading(false);
    });
  }, []);

  const repo = useMemo<Repository | null>(() => {
    if (!session) return null;
    if (session.mode === 'firebase') return new FirestoreRepository(session.uid, VEHICLE_ID);
    return new LocalRepository(`em:${session.uid}:${VEHICLE_ID}`);
  }, [session]);

  const value: SessionCtx = {
    session,
    loading,
    repo,
    firebaseConfigured,
    enterDemo() {
      try {
        localStorage.setItem(DEMO_KEY, '1');
      } catch {
        /* sem storage: sessão só em memória */
      }
      setSession({ mode: 'demo', uid: 'demo', displayName: 'Demonstração', email: null });
    },
    async signInEmail(email, password) {
      if (!auth) throw new Error('Firebase não configurado');
      await signInWithEmailAndPassword(auth, email, password);
    },
    async signUpEmail(email, password) {
      if (!auth) throw new Error('Firebase não configurado');
      await createUserWithEmailAndPassword(auth, email, password);
    },
    async signInGoogle() {
      if (!auth) throw new Error('Firebase não configurado');
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    async logout() {
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch {
        /* ignore */
      }
      if (auth?.currentUser) await signOut(auth);
      setSession(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession fora do SessionProvider');
  return c;
}

/** Traduz códigos de erro do Firebase Auth para mensagens úteis. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/operation-not-allowed':
      'Método de login não habilitado no Firebase Console (Authentication → Sign-in method).',
    'auth/configuration-not-found': 'Authentication ainda não foi ativado no Firebase Console.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).',
    'auth/popup-closed-by-user': 'Janela de login fechada.',
    'auth/unauthorized-domain': 'Domínio não autorizado no Firebase Console (Authentication → Settings).',
  };
  return map[code] ?? (e instanceof Error ? e.message : 'Erro desconhecido');
}
