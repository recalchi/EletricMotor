import { useApp, type ViewMode } from '../../app/store';
import { cx } from '../../shared/ui';
import type { CameraPreset } from './VehicleScene';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'externo', label: 'Externo' },
  { id: 'eletrico', label: 'Elétrico' },
  { id: 'mecanico', label: 'Mecânico' },
  { id: 'sensores', label: 'Sensores' },
];
const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'iso', label: 'Iso' },
  { id: 'lateral', label: 'Lateral' },
  { id: 'frontal', label: 'Frontal' },
  { id: 'superior', label: 'Superior' },
  { id: 'traseira', label: 'Traseira' },
];

const chip = (on: boolean) =>
  cx(
    'rounded px-2 py-1 text-[11px] font-medium transition ring-1',
    on
      ? 'bg-cyanx-500/20 text-cyanx-300 ring-cyanx-400/60'
      : 'bg-ink-900/80 text-slate-300 ring-ink-600 hover:text-white',
  );

export function SceneToolbar({ onPreset }: { onPreset: (p: CameraPreset) => void }) {
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const exploded = useApp((s) => s.exploded);
  const hideFairings = useApp((s) => s.hideFairings);
  const xray = useApp((s) => s.xray);
  const toggle = useApp((s) => s.toggle);
  const isolateId = useApp((s) => s.isolateId);
  const isolate = useApp((s) => s.isolate);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex gap-1" role="group" aria-label="Modo de visualização">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={chip(viewMode === m.id)}
            onClick={() => setViewMode(m.id)}
            aria-pressed={viewMode === m.id}
          >
            {m.label}
          </button>
        ))}
      </div>
      <span className="mx-1 h-4 w-px bg-ink-600" />
      <button className={chip(exploded)} onClick={() => toggle('exploded')} aria-pressed={exploded}>
        Vista explodida
      </button>
      <button className={chip(hideFairings)} onClick={() => toggle('hideFairings')} aria-pressed={hideFairings}>
        Ocultar carenagens
      </button>
      <button className={chip(xray)} onClick={() => toggle('xray')} aria-pressed={xray}>
        Transparência
      </button>
      {isolateId && (
        <button className={chip(true)} onClick={() => isolate(null)}>
          Sair do isolamento ✕
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-ink-600" />
      <div className="flex gap-1" role="group" aria-label="Enquadramento">
        {PRESETS.map((p) => (
          <button key={p.id} className={chip(false)} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SensorLegend() {
  const viewMode = useApp((s) => s.viewMode);
  if (viewMode !== 'sensores') return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded border border-ink-600 bg-ink-950/85 p-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-cyanx-400" /> Leitura do sistema original — interface a investigar
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-proposal" /> Sensor adicional proposto (não instalado)
      </div>
    </div>
  );
}
