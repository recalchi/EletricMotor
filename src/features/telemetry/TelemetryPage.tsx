import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { CATALOG } from '../../domain/catalog';
import type { DataOrigin, Quantity, TelemetrySample } from '../../domain/types';
import { downloadText, samplesToCsv } from '../../integrations/csv';
import { Button, Card, Field, OriginBadge, PageHeader } from '../../shared/ui';
import { TimeSeriesChart } from '../../shared/ui/charts';
import { Icon } from '../../shared/ui/icons';

const COLORS = ['#22d3ee', '#fb923c', '#34d399', '#f472b6'];

export default function TelemetryPage() {
  const signals = useMemo(
    () => CATALOG.flatMap((c) => c.signals.map((s) => ({ c, s, key: `${c.id}:${s.quantity}` }))),
    [],
  );
  const [picked, setPicked] = useState<string[]>(['battery-a:soc', 'battery-b:soc']);
  const [windowMin, setWindowMin] = useState(2);
  const [origin, setOrigin] = useState<DataOrigin>('SIMULADO');
  const history = useApp((s) => s.history);
  const latest = useApp((s) => s.latest);

  const exportCsv = () => {
    const rows: TelemetrySample[] = [];
    for (const key of picked) {
      const [componentId, quantity] = key.split(':');
      const last = latest[origin][key];
      for (const p of history[origin][key] ?? []) {
        rows.push({
          vehicleId: 'evs-1',
          componentId,
          sensorId: last?.sensorId ?? '',
          quantity: quantity as Quantity,
          value: p.v,
          unit: last?.unit ?? '',
          timestamp: p.t,
          origin,
          quality: 'boa',
          validForMs: 0,
          parserVersion: last?.parserVersion ?? '',
          deviceId: last?.deviceId ?? '',
        });
      }
    }
    downloadText(`telemetria-${origin.toLowerCase()}-${new Date().toISOString().slice(0, 19)}.csv`, samplesToCsv(rows));
  };

  const series = picked.slice(0, 4).map((k, i) => {
    const sg = signals.find((x) => x.key === k)!;
    return {
      componentId: sg.c.id,
      quantity: sg.s.quantity,
      label: `${sg.c.name} · ${sg.s.quantity}`,
      color: COLORS[i],
      unit: sg.s.unit,
    };
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Telemetria"
        subtitle="Séries temporais em memória (alta frequência não é gravada no Firestore). Origens nunca são misturadas no mesmo gráfico."
        right={
          <Button onClick={exportCsv} disabled={!picked.length}>
            <Icon name="download" /> Exportar CSV
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <Card title="Séries (até 4)">
          <Field label="Origem">
            <select className="input mb-3" value={origin} onChange={(e) => setOrigin(e.target.value as DataOrigin)}>
              <option value="SIMULADO">SIMULADO</option>
              <option value="REAL">REAL (nenhuma fonte validada)</option>
            </select>
          </Field>
          <Field label="Janela">
            <select className="input mb-3" value={windowMin} onChange={(e) => setWindowMin(Number(e.target.value))}>
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
            </select>
          </Field>
          <div className="max-h-[420px] space-y-0.5 overflow-auto">
            {signals.map(({ c, s, key }) => {
              const has = (history[origin][key]?.length ?? 0) > 0;
              return (
                <label key={key} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-ink-800">
                  <input
                    type="checkbox"
                    checked={picked.includes(key)}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...picked, key].slice(-4) : picked.filter((x) => x !== key))
                    }
                  />
                  <span className={has ? 'text-slate-200' : 'text-slate-500'}>
                    {c.name} · {s.quantity}
                  </span>
                  {has && <OriginBadge origin={origin} className="ml-auto" />}
                </label>
              );
            })}
          </div>
        </Card>
        <Card title="Gráfico">
          {origin === 'REAL' ? (
            <p className="text-sm text-slate-400">Nenhuma série REAL — nenhuma interface da moto foi validada.</p>
          ) : series.length ? (
            <TimeSeriesChart
              key={picked.join('|') + windowMin}
              series={series}
              height={380}
              windowMs={windowMin * 60_000}
            />
          ) : (
            <p className="text-sm text-slate-400">Selecione séries à esquerda.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
