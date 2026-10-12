import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../data/firebase';
import { isNative } from '../platform/native';
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
      if (isNative()) {
        // No APK o popup não funciona no WebView: login Google nativo (Credential Manager) e o
        // idToken é entregue ao Firebase JS SDK — a sessão continua sendo a mesma do app web.
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const r = await FirebaseAuthentication.signInWithGoogle();
        const idToken = r.credential?.idToken;
        if (!idToken) throw new Error('Login Google não retornou credencial.');
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        return;
      }
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    async logout() {
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch {
        /* ignore */
      }
      if (isNative()) {
        try {
          const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
          await FirebaseAuthentication.signOut();
        } catch {
          /* sem sessão nativa */
        }
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
  if (map[code]) return map[code];
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? '');
  // Erros do login Google nativo (Android Credential Manager)
  if (/cancel/i.test(msg)) return 'Login Google cancelado.';
  if (/no credentials|NoCredential/i.test(msg))
    return 'Nenhuma conta Google disponível ou app Android não registrado no Firebase (SHA-1). Veja docs/android.md.';
  if (/developer_error|10:|default_web_client_id/i.test(msg))
    return 'Login Google não configurado para o app Android (google-services.json / SHA-1). Veja docs/android.md.';
  return msg || 'Erro desconhecido';
}
