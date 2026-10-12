import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../app/session';
import type { AuditEntry, Photo } from '../domain/types';
import { newId, type CollectionName, type Repository } from './repository';

const COLLECTION_LABEL: Record<CollectionName, string> = {
  maintenance: 'Manutenção',
  inspections: 'Inspeção',
  chargingSessions: 'Sessão de carga',
  batteryReadings: 'Leitura de bateria',
  symptoms: 'Sintoma',
  alerts: 'Alerta',
  auditLog: 'Auditoria',
  devices: 'Dispositivo',
};

function summarize(item: Record<string, unknown> | undefined): string {
  if (!item) return '';
  const v = item.description ?? item.notes ?? item.title ?? item.source ?? item.location ?? '';
  return String(v).slice(0, 120);
}

/** Registra uma entrada na trilha de auditoria (falhas não bloqueiam a operação principal). */
export async function audit(
  repo: Repository,
  actor: string,
  action: AuditEntry['action'],
  collection: CollectionName | 'vehicle' | 'batteries' | 'settings',
  docId: string,
  summary: string,
) {
  const entry: AuditEntry = { id: newId(), at: Date.now(), action, collection, docId, summary, actor };
  await repo.put('auditLog', entry).catch(() => undefined);
}

/** Lista reativa de uma coleção do veículo + operações auditadas. Erros de rede/regras ficam expostos. */
export function useCollection<T extends { id: string }>(name: CollectionName) {
  const { repo, session } = useSession();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const actor = session?.email ?? session?.displayName ?? 'desconhecido';

  useEffect(() => {
    if (!repo) return;
    return repo.watch<T>(name, setItems);
  }, [repo, name]);

  const add = useCallback(
    async (item: Omit<T, 'id'> & { id?: string }) => {
      if (!repo) return;
      try {
        const id = item.id ?? newId();
        await repo.put(name, { ...item, id } as T);
        if (name !== 'auditLog')
          await audit(
            repo,
            actor,
            item.id ? 'atualizar' : 'criar',
            name,
            id,
            summarize(item as Record<string, unknown>),
          );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo, name, actor],
  );
  const remove = useCallback(
    async (id: string) => {
      if (!repo) return;
      try {
        const current = items.find((x) => x.id === id) as (T & { photos?: Photo[] }) | undefined;
        await Promise.all((current?.photos ?? []).map((p) => repo.deletePhoto(p)));
        await repo.remove(name, id);
        if (name !== 'auditLog')
          await audit(repo, actor, 'excluir', name, id, summarize(current as Record<string, unknown> | undefined));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo, name, actor, items],
  );
  return { items, add, remove, error, label: COLLECTION_LABEL[name] };
}

/** Documento único (perfil do veículo, baterias, preferências). */
export function useDoc<T extends object>(key: 'vehicle' | 'batteries' | 'settings', fallback: T) {
  const { repo, session } = useSession();
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo
      .getDoc<T>(key)
      .then((v) => alive && (setValue(v ? { ...fallback, ...v } : fallback), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key]);
  const save = useCallback(
    async (v: T) => {
      setValue(v);
      if (!repo) return;
      await repo.setDoc(key, v);
      await audit(
        repo,
        session?.email ?? session?.displayName ?? 'desconhecido',
        'atualizar',
        key,
        key,
        'Documento salvo',
      );
    },
    [repo, key, session],
  );
  return { value, save, loaded };
}

/** Upload de fotos com estado de progresso/erro. */
export function usePhotoUpload() {
  const { repo } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useCallback(
    async (files: FileList | File[]): Promise<Photo[]> => {
      if (!repo) return [];
      setBusy(true);
      setError(null);
      try {
        const out: Photo[] = [];
        for (const f of Array.from(files)) {
          if (!f.type.startsWith('image/')) continue;
          out.push(await repo.uploadPhoto(f));
        }
        return out;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return [];
      } finally {
        setBusy(false);
      }
    },
    [repo],
  );
  const discard = useCallback(async (p: Photo) => repo?.deletePhoto(p), [repo]);
  return { upload, discard, busy, error };
}
