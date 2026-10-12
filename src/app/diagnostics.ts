/**
 * Diagnóstico do próprio software + gravador de sessão de captura.
 *
 * 1) Registro de erros do app (exceções, promessas rejeitadas, falhas de adaptadores e de tela) — anel de
 *    300 entradas persistido no navegador, exportável como relatório.
 * 2) Gravador de captura: quando ativo, registra TUDO o que chega dos adaptadores físicos (bytes/linhas brutos,
 *    mensagens interpretadas, rejeições, descoberta de serviços BLE, eventos de conexão) em IndexedDB, para
 *    exportar em JSONL e evoluir o programa. Somente recepção: nada é enviado à moto.
 *
 * Privacidade: nada sai do aparelho automaticamente; a exportação é manual.
 */
import { create } from 'zustand';

export const APP_VERSION = '0.6.0';

// ───────────────────────── Registro de erros

export interface AppErrorEntry {
  at: number;
  level: 'erro' | 'aviso';
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

const ERR_KEY = 'em:diag-errors';
const ERR_MAX = 300;

function loadErrors(): AppErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(ERR_KEY) ?? '[]') as AppErrorEntry[];
  } catch {
    return [];
  }
}

interface DiagState {
  errors: AppErrorEntry[];
  capturing: boolean;
  captureCount: number;
  captureSession: string | null;
  captureStartedAt: number | null;
  captureRaw: boolean;
  online: boolean;
  setOnline(v: boolean): void;
}

export const useDiag = create<DiagState>((set) => ({
  errors: typeof window === 'undefined' ? [] : loadErrors(),
  capturing: false,
  captureCount: 0,
  captureSession: null,
  captureStartedAt: null,
  captureRaw: true,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setOnline: (online) => set({ online }),
}));

export function reportError(
  source: string,
  err: unknown,
  context?: Record<string, unknown>,
  level: AppErrorEntry['level'] = 'erro',
) {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const entry: AppErrorEntry = {
    at: Date.now(),
    level,
    source,
    message: e.message.slice(0, 500),
    stack: e.stack?.split('\n').slice(0, 8).join('\n'),
    context,
  };
  const errors = [entry, ...useDiag.getState().errors].slice(0, ERR_MAX);
  useDiag.setState({ errors });
  try {
    localStorage.setItem(ERR_KEY, JSON.stringify(errors));
  } catch {
    /* sem armazenamento: mantém em memória */
  }
  if (useDiag.getState().capturing) capture({ src: source, kind: 'erro', data: entry.message, meta: context });
}

export function clearErrors() {
  useDiag.setState({ errors: [] });
  try {
    localStorage.removeItem(ERR_KEY);
  } catch {
    /* ignore */
  }
}

let installed = false;
/** Captura global de exceções e promessas rejeitadas; monitora conectividade de rede. */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) =>
    reportError('janela', ev.error ?? ev.message, { arquivo: ev.filename, linha: ev.lineno }),
  );
  window.addEventListener('unhandledrejection', (ev) => reportError('promessa', ev.reason));
  window.addEventListener('online', () => useDiag.getState().setOnline(true));
  window.addEventListener('offline', () => {
    useDiag.getState().setOnline(false);
    reportError('rede', 'Dispositivo ficou sem internet', undefined, 'aviso');
  });
}

export function environmentInfo() {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } })
    .Capacitor;
  return {
    appVersion: APP_VERSION,
    platform: cap?.getPlatform?.() ?? 'web',
    native: cap?.isNativePlatform?.() ?? false,
    userAgent: nav?.userAgent,
    language: nav?.language,
    webSerial: !!nav && 'serial' in nav,
    webBluetooth: !!nav && 'bluetooth' in nav,
    screen:
      typeof window === 'undefined'
        ? undefined
        : `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Relatório textual (JSON) para copiar/compartilhar ao relatar um problema. */
export function errorReport(extra?: Record<string, unknown>) {
  return JSON.stringify(
    { geradoEm: new Date().toISOString(), ambiente: environmentInfo(), ...extra, erros: useDiag.getState().errors },
    null,
    2,
  );
}

// ───────────────────────── Gravador de captura (IndexedDB)

export type CaptureKind = 'bruto' | 'linha' | 'mensagem' | 'rejeitado' | 'gatt' | 'evento' | 'erro' | 'amostra';

export interface CaptureRecord {
  session: string;
  seq: number;
  t: number;
  src: string;
  kind: CaptureKind;
  data: string;
  meta?: unknown;
}

const DB_NAME = 'em-capture';
const STORE = 'records';
const MAX_RECORDS_PER_SESSION = 200_000;
let dbp: Promise<IDBDatabase> | null = null;
let seq = 0;
let pending: CaptureRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { autoIncrement: true });
      s.createIndex('session', 'session');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function flush() {
  flushTimer = null;
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      batch.forEach((r) => st.add(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // falha de armazenamento não pode derrubar a recepção de dados
    console.warn('captura: falha ao gravar', e);
  }
}

/** Registra um evento na sessão de captura ativa (no-op se o gravador estiver desligado). */
export function capture(r: { src: string; kind: CaptureKind; data: string; meta?: unknown }) {
  const st = useDiag.getState();
  if (!st.capturing || !st.captureSession) return;
  if (r.kind === 'bruto' && !st.captureRaw) return;
  if (st.captureCount >= MAX_RECORDS_PER_SESSION) return;
  pending.push({
    session: st.captureSession,
    seq: seq++,
    t: Date.now(),
    src: r.src,
    kind: r.kind,
    data: r.data.slice(0, 4096),
    meta: r.meta,
  });
  useDiag.setState({ captureCount: st.captureCount + 1 });
  if (!flushTimer) flushTimer = setTimeout(flush, 500);
}

export function startCapture(raw = true) {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  seq = 0;
  useDiag.setState({
    capturing: true,
    captureSession: id,
    captureCount: 0,
    captureStartedAt: Date.now(),
    captureRaw: raw,
  });
  capture({ src: 'app', kind: 'evento', data: 'Início da sessão de captura', meta: environmentInfo() });
  return id;
}

export async function stopCapture() {
  capture({ src: 'app', kind: 'evento', data: 'Fim da sessão de captura' });
  await flush();
  useDiag.setState({ capturing: false });
}

export async function listSessions(): Promise<{ session: string; count: number; first: number; last: number }[]> {
  await flush();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map<string, { session: string; count: number; first: number; last: number }>();
    const req = db.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve([...out.values()].sort((a, b) => b.first - a.first));
      const r = c.value as CaptureRecord;
      const s = out.get(r.session) ?? { session: r.session, count: 0, first: r.t, last: r.t };
      s.count++;
      s.first = Math.min(s.first, r.t);
      s.last = Math.max(s.last, r.t);
      out.set(r.session, s);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function readSession(session: string): Promise<CaptureRecord[]> {
  await flush();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).index('session').getAll(IDBKeyRange.only(session));
    req.onsuccess = () => resolve((req.result as CaptureRecord[]).sort((a, b) => a.seq - b.seq));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(session: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).index('session').openCursor(IDBKeyRange.only(session));
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** JSONL: 1ª linha = cabeçalho (ambiente + contexto), depois um registro por linha. */
export function toJsonl(records: CaptureRecord[], header: Record<string, unknown>) {
  return [
    JSON.stringify({ tipo: 'cabecalho', formato: 'eletricmotor-captura-1', ...header }),
    ...records.map((r) => JSON.stringify(r)),
  ].join('\n');
}

/** Converte bytes em hexadecimal legível ("0a ff 12"). */
export function toHex(bytes: Uint8Array | DataView, max = 512): string {
  const u8 = bytes instanceof DataView ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
  return (
    Array.from(u8.subarray(0, max), (b) => b.toString(16).padStart(2, '0')).join(' ') + (u8.length > max ? ' …' : '')
  );
}
