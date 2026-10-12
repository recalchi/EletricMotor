import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../app/session';
import { newId, type CollectionName } from './repository';

/** Lista reativa de uma coleção do veículo + operações. Erros de rede/regras ficam expostos. */
export function useCollection<T extends { id: string }>(name: CollectionName) {
  const { repo } = useSession();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) return;
    return repo.watch<T>(name, setItems);
  }, [repo, name]);

  const add = useCallback(
    async (item: Omit<T, 'id'> & { id?: string }) => {
      if (!repo) return;
      try {
        await repo.put(name, { ...item, id: item.id ?? newId() } as T);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo, name],
  );
  const remove = useCallback(
    async (id: string) => {
      if (!repo) return;
      try {
        await repo.remove(name, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo, name],
  );
  return { items, add, remove, error };
}

/** Documento único (perfil do veículo, baterias, preferências). */
export function useDoc<T extends object>(key: 'vehicle' | 'batteries' | 'settings', fallback: T) {
  const { repo } = useSession();
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
      await repo?.setDoc(key, v);
    },
    [repo, key],
  );
  return { value, save, loaded };
}
