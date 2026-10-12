import { useState } from 'react';
import { usePhotoUpload } from '../../data/hooks';
import type { Photo } from '../../domain/types';
import { Icon } from './icons';

/** Seletor de fotos com miniaturas; as fotos são enviadas ao escolher e ficam pendentes até salvar o registro. */
export function PhotoInput({ value, onChange }: { value: Photo[]; onChange: (p: Photo[]) => void }) {
  const { upload, discard, busy, error } = usePhotoUpload();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((p) => (
          <div key={p.path} className="relative">
            <img src={p.url} alt={p.name} className="h-14 w-14 rounded object-cover ring-1 ring-ink-600" />
            <button
              type="button"
              aria-label={`Remover ${p.name}`}
              onClick={() => {
                discard(p);
                onChange(value.filter((x) => x.path !== p.path));
              }}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-950 p-0.5 text-slate-300 ring-1 ring-ink-600 hover:text-red-300"
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-ink-600 text-[10px] text-slate-400 hover:border-cyanx-400 hover:text-cyanx-300">
          <Icon name="camera" className="h-5 w-5" />
          {busy ? 'enviando…' : 'foto'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const files = e.target.files;
              if (!files?.length) return;
              const added = await upload(files);
              onChange([...value, ...added]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** Galeria de miniaturas com visualização ampliada. */
export function PhotoStrip({ photos }: { photos?: Photo[] }) {
  const [open, setOpen] = useState<Photo | null>(null);
  if (!photos?.length) return null;
  return (
    <>
      <div className="mt-1 flex flex-wrap gap-1">
        {photos.map((p) => (
          <button key={p.path} type="button" onClick={() => setOpen(p)} aria-label={`Ampliar ${p.name}`}>
            <img
              src={p.url}
              alt={p.name}
              className="h-10 w-10 rounded object-cover ring-1 ring-ink-600 hover:ring-cyanx-400"
            />
          </button>
        ))}
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(null)}
        >
          <figure className="max-h-full max-w-4xl">
            <img src={open.url} alt={open.name} className="max-h-[80vh] rounded" />
            <figcaption className="mt-2 text-center text-xs text-slate-300">
              {open.name} · {new Date(open.takenAt).toLocaleString('pt-BR')}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
