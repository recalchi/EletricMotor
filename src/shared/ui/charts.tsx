import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSeries } from '../../app/telemetry';
import type { Quantity } from '../../domain/types';
import { EmptyTelemetry, OriginBadge } from './index';

export interface SeriesDef {
  componentId: string;
  quantity: Quantity;
  label: string;
  color: string;
  unit: string;
}

const tfmt = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Gráfico temporal de várias séries. Nunca mistura origens: usa a origem da primeira série com dados. */
export function TimeSeriesChart({
  series,
  height = 220,
  windowMs = 120_000,
}: {
  series: SeriesDef[];
  height?: number;
  windowMs?: number;
}) {
  const s0 = useSeries(series[0].componentId, series[0].quantity);
  const s1 = useSeries(series[1]?.componentId ?? '', series[1]?.quantity ?? 'soc');
  const s2 = useSeries(series[2]?.componentId ?? '', series[2]?.quantity ?? 'soc');
  const s3 = useSeries(series[3]?.componentId ?? '', series[3]?.quantity ?? 'soc');
  const all = [s0, s1, s2, s3].slice(0, series.length);
  const origin = all.find((x) => x.data.length)?.origin ?? 'INDISPONIVEL';

  const data = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    const tMax = Math.max(0, ...all.map((x) => x.data[x.data.length - 1]?.t ?? 0));
    all.forEach((x, i) => {
      if (x.origin !== origin) return;
      for (const p of x.data) {
        if (p.t < tMax - windowMs) continue;
        const k = Math.round(p.t / 500) * 500;
        const row = map.get(k) ?? { t: k };
        row[`s${i}`] = Math.round(p.v * 100) / 100;
        map.set(k, row);
      }
    });
    return [...map.values()].sort((a, b) => a.t - b.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s0.data, s1.data, s2.data, s3.data, origin, windowMs]);

  if (origin === 'INDISPONIVEL' || !data.length)
    return (
      <EmptyTelemetry>
        Sem série temporal. Inicie o simulador no Laboratório ou conecte uma fonte validada.
      </EmptyTelemetry>
    );

  const multiUnit = new Set(series.map((s) => s.unit)).size > 1;
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <OriginBadge origin={origin} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#13294a" strokeDasharray="3 3" />
          <XAxis dataKey="t" tickFormatter={tfmt} stroke="#64748b" fontSize={10} minTickGap={40} />
          <YAxis yAxisId="l" stroke="#64748b" fontSize={10} />
          {multiUnit && <YAxis yAxisId="r" orientation="right" stroke="#64748b" fontSize={10} />}
          <Tooltip
            contentStyle={{ background: '#06101f', border: '1px solid #1c3a5e', fontSize: 12 }}
            labelFormatter={(t) => tfmt(Number(t))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line
              key={i}
              yAxisId={multiUnit && s.unit !== series[0].unit ? 'r' : 'l'}
              type="monotone"
              dataKey={`s${i}`}
              name={`${s.label} (${s.unit})`}
              stroke={s.color}
              dot={false}
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
