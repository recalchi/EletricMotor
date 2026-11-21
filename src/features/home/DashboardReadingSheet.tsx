import { useState } from 'react';
import { useCollection } from '../../data/hooks';
import type { DashboardReading, RidingMode } from '../../domain/types';
import { cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

/** Cores dos losangos de modo no painel da EVS. */
export const MODE_STYLE: Record<RidingMode, { label: string; cls: string }> = {
  eco: { label: 'ECO', cls: 'bg-emerald-500 text-white' },
  sport: { label: 'SPORT', cls: 'bg-sky-500 text-white' },
  turbo: { label: 'TURBO', cls: 'bg-red-500 text-white' },
};

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
};

function NumField({
  label,
  unit,
  value,
  onChange,
  max,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  const v = num(value);
  const bad = v != null && (v < 0 || v > max);
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <span
        className={cx(
          'flex items-center rounded-xl bg-ink-850 px-3 ring-1',
          bad ? 'ring-red-500' : 'ring-ink-700 focus-within:ring-cyanx-400',
        )}
      >
        <input
          inputMode="decimal"
          className="min-h-[44px] w-full bg-transparent text-lg text-fg outline-none placeholder:text-slate-600"
          placeholder="—"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-sm text-slate-500">{unit}</span>
      </span>
      {bad && <span className="mt-0.5 block text-[11px] text-red-300">Fora do intervalo (0–{max})</span>}
    </label>
  );
}

/**
 * Registro rápido do que aparece no painel TFT da moto. É a forma honesta de ter números da EVS hoje,
 * enquanto a interface interna (BMS/controladora) não é conhecida.
 */
export function DashboardReadingSheet({ onClose, last }: { onClose: () => void; last?: DashboardReading }) {
  const { add } = useCollection<DashboardReading>('dashboardReadings');
  const [f, setF] = useState({
    soc: '',
    range: '',
    odo: last?.odometerKm != null ? String(last.odometerKm) : '',
    tripA: '',
    tripB: '',
    ambient: '',
    note: '',
  });
  const [mode, setMode] = useState<RidingMode | null>(last?.mode ?? null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const limits = { soc: 100, range: 300, odo: 500_000, tripA: 100_000, tripB: 100_000, ambient: 70 };
  const invalid = (Object.keys(limits) as (keyof typeof limits)[]).some((k) => {
    const v = num(f[k]);
    return v != null && (v < 0 || v > limits[k]);
  });
  const empty = [f.soc, f.range, f.odo, f.tripA, f.tripB, f.ambient].every((x) => x.trim() === '') && !mode;

  const save = async () => {
    setBusy(true);
    await add({
      timestamp: Date.now(),
      socPercent: num(f.soc),
      rangeKm: num(f.range),
      odometerKm: num(f.odo),
      tripAKm: num(f.tripA),
      tripBKm: num(f.tripB),
      mode,
      ambientC: num(f.ambient),
      note: f.note.trim(),
    });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Registrar leitura do painel"
        className="pb-safe max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Ler o painel da moto</h2>
            <p className="text-xs text-slate-500">
              Digite o que aparece no painel agora. Deixe em branco o que não leu.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-slate-400 active:bg-ink-800">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumField label="Bateria (capacidade)" unit="%" value={f.soc} onChange={set('soc')} max={limits.soc} />
          <NumField label="Autonomia aprox." unit="km" value={f.range} onChange={set('range')} max={limits.range} />
          <div className="col-span-2">
            <NumField label="Total (odômetro)" unit="km" value={f.odo} onChange={set('odo')} max={limits.odo} />
          </div>
          <NumField label="Trip A" unit="km" value={f.tripA} onChange={set('tripA')} max={limits.tripA} />
          <NumField label="Trip B" unit="km" value={f.tripB} onChange={set('tripB')} max={limits.tripB} />
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-xs text-slate-500">Modo de condução aceso</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_STYLE) as RidingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(mode === m ? null : m)}
                aria-pressed={mode === m}
                className={cx(
                  'min-h-[44px] rounded-xl text-sm font-semibold tracking-wider transition',
                  mode === m ? MODE_STYLE[m].cls : 'bg-ink-850 text-slate-400 ring-1 ring-ink-700',
                )}
              >
                {MODE_STYLE[m].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumField
            label="Temperatura (painel)"
            unit="°C"
            value={f.ambient}
            onChange={set('ambient')}
            max={limits.ambient}
          />
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Observação</span>
            <input
              className="min-h-[44px] w-full rounded-xl bg-ink-850 px-3 text-sm text-fg outline-none ring-1 ring-ink-700 focus:ring-cyanx-400"
              placeholder="ex.: após carga"
              value={f.note}
              onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))}
            />
          </label>
        </div>

        <button
          disabled={busy || invalid || empty}
          onClick={() => void save()}
          className="mt-5 min-h-[48px] w-full rounded-2xl bg-slate-100 text-[15px] font-semibold text-ink-900 transition active:scale-[0.99] disabled:opacity-40"
          data-testid="dash-save"
        >
          {busy ? 'Salvando…' : 'Salvar leitura'}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          Fica registrado como “lido no painel”, com data e hora — não é telemetria automática.
        </p>
      </div>
    </div>
  );
}
