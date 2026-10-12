import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/** Coleções persistidas por veículo. Telemetria em alta frequência NÃO é persistida aqui. */
export type CollectionName =
  | 'maintenance'
  | 'inspections'
  | 'chargingSessions'
  | 'batteryReadings'
  | 'symptoms'
  | 'alerts'
  | 'auditLog';

export interface Repository {
  readonly kind: 'local' | 'firestore';
  list<T extends { id: string }>(name: CollectionName): Promise<T[]>;
  watch<T extends { id: string }>(name: CollectionName, cb: (items: T[]) => void): () => void;
  put<T extends { id: string }>(name: CollectionName, item: T): Promise<void>;
  remove(name: CollectionName, id: string): Promise<void>;
  getDoc<T>(key: 'vehicle' | 'batteries' | 'settings'): Promise<T | null>;
  setDoc<T extends object>(key: 'vehicle' | 'batteries' | 'settings', value: T): Promise<void>;
}

// ───────────────────────── Local (modo demonstração)

export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private listeners = new Map<string, Set<(items: unknown[]) => void>>();
  constructor(private prefix: string) {}

  private key(n: string) {
    return `${this.prefix}:${n}`;
  }
  private read<T>(n: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.key(n));
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(n: string, v: unknown) {
    try {
      localStorage.setItem(this.key(n), JSON.stringify(v));
    } catch {
      /* armazenamento indisponível — mantém em memória apenas */
    }
  }
  private notify(n: CollectionName) {
    const items = this.read<unknown[]>(n, []);
    this.listeners.get(n)?.forEach((cb) => cb(items));
  }

  async list<T extends { id: string }>(n: CollectionName) {
    return this.read<T[]>(n, []);
  }
  watch<T extends { id: string }>(n: CollectionName, cb: (items: T[]) => void) {
    const set = this.listeners.get(n) ?? new Set();
    set.add(cb as (i: unknown[]) => void);
    this.listeners.set(n, set);
    cb(this.read<T[]>(n, []));
    return () => void set.delete(cb as (i: unknown[]) => void);
  }
  async put<T extends { id: string }>(n: CollectionName, item: T) {
    const items = this.read<T[]>(n, []);
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.unshift(item);
    this.write(n, items);
    this.notify(n);
  }
  async remove(n: CollectionName, id: string) {
    this.write(
      n,
      this.read<{ id: string }[]>(n, []).filter((x) => x.id !== id),
    );
    this.notify(n);
  }
  async getDoc<T>(k: string) {
    return this.read<T | null>(`doc:${k}`, null);
  }
  async setDoc<T extends object>(k: string, v: T) {
    this.write(`doc:${k}`, v);
  }
}

// ───────────────────────── Firestore

/** users/{uid}/vehicles/{vehicleId}/{collection}/{id} — acesso restrito ao dono via firestore.rules. */
export class FirestoreRepository implements Repository {
  readonly kind = 'firestore' as const;
  constructor(
    private uid: string,
    private vehicleId: string,
  ) {
    if (!db) throw new Error('Firestore não configurado');
  }
  private col(n: string) {
    return collection(db!, 'users', this.uid, 'vehicles', this.vehicleId, n);
  }
  private vehicleDoc() {
    return doc(db!, 'users', this.uid, 'vehicles', this.vehicleId);
  }

  async list<T extends { id: string }>(n: CollectionName) {
    const snap = await getDocs(this.col(n));
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  }
  watch<T extends { id: string }>(n: CollectionName, cb: (items: T[]) => void) {
    return onSnapshot(
      this.col(n),
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }))),
      () => cb([]),
    );
  }
  async put<T extends { id: string }>(n: CollectionName, item: T) {
    await setDoc(doc(this.col(n), item.id), { ...stripUndefined(item), updatedAt: serverTimestamp() });
  }
  async remove(n: CollectionName, id: string) {
    await deleteDoc(doc(this.col(n), id));
  }
  async getDoc<T>(k: string) {
    const snap = await getDoc(k === 'vehicle' ? this.vehicleDoc() : doc(this.col('meta'), k));
    return snap.exists() ? (snap.data() as T) : null;
  }
  async setDoc<T extends object>(k: string, v: T) {
    const ref = k === 'vehicle' ? this.vehicleDoc() : doc(this.col('meta'), k);
    await setDoc(ref, { ...stripUndefined(v), updatedAt: serverTimestamp() }, { merge: true });
  }
}

function stripUndefined<T extends object>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 20);
