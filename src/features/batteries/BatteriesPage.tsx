import { useState } from 'react';
import { useApp } from '../../app/store';
import { useReading } from '../../app/telemetry';
import { useBatteries, useRangeEstimate } from '../../app/vehicleData';
import { useCollection } from '../../data/hooks';
import { nominalEnergyKWh } from '../../domain/estimates';
import type { BatteryProfile, ChargingSession, ManualBatteryReading } from '../../domain/types';
import { Bar, Button, Card, EmptyTelemetry, Field, OriginBadge, PageHeader, Reading, fmtValue } from '../../shared/ui';
import { TimeSeriesChart } from '../../shared/ui/charts';
import { Icon } from '../../shared/ui/icons';

type BId = 'battery-a' | 'battery-b';

function BatteryCard({
  id,
  profile,
  onSave,
}: {
  id: BId;
  profile: BatteryProfile;
  onSave: (p: BatteryProfile) => void;
}) {
  const soc = useReading(id, 'soc', '%');
  const v = useReading(id, 'voltage', 'V');
  const i = useReading(id, 'current', 'A');
  const t = useReading(id, 'temperature', '°C');
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(profile);
  const nominal = nominalEnergyKWh(profile.labelVoltageV, profile.labelCapacityAh);
  const label = id === 'battery-a' ? 'Bateria A' : 'Bateria B';

  return (
    <Card
      title={label}
      right={
        <button className="text-xs text-cyanx-300" onClick={() => (setDraft(profile), setEdit(!edit))}>
          {edit ? 'Cancelar' : 'Editar cadastro'}
        </button>
      }
    >
      {!profile.installed ? (
        <EmptyTelemetry>Bateria marcada como não instalada.</EmptyTelemetry>
      ) : (
        <>
          <div className="mb-3">
            <Reading label="SOC — estado de carga" dv={soc} big />
            <div className="mt-1">
              <Bar value={soc.value} tone={(soc.value ?? 100) < 20 ? 'amber' : 'green'} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Reading label="Tensão" dv={v} />
            <Reading label="Corrente" dv={i} />
            <Reading label="Temperatura" dv={t} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">SOH — saúde</div>
              <div className="text-slate-500">—</div>
              <OriginBadge origin="INDISPONIVEL" />
              <p className="mt-1 text-[10px] text-slate-500">Requer histórico de capacidade medida; não estimado.</p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Ciclos</div>
              <div className="text-slate-500">—</div>
              <OriginBadge origin="INDISPONIVEL" />
            </div>
          </div>
        </>
      )}

      <div className="mt-4 border-t border-ink-700 pt-3 text-sm">
        {edit ? (
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSave(draft);
              setEdit(false);
            }}
          >
            <Field label="Instalada">
              <select
                className="input"
                value={draft.installed ? '1' : '0'}
                onChange={(e) => setDraft({ ...draft, installed: e.target.value === '1' })}
              >
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </Field>
            <Field label="Nº de série">
              <input
                className="input"
                value={draft.serial}
                onChange={(e) => setDraft({ ...draft, serial: e.target.value })}
              />
            </Field>
            <Field label="Tensão nominal (V)">
              <input
                className="input"
                type="number"
                step="0.1"
                value={draft.labelVoltageV ?? ''}
                onChange={(e) => setDraft({ ...draft, labelVoltageV: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label="Capacidade (Ah)">
              <input
                className="input"
                type="number"
                step="0.1"
                value={draft.labelCapacityAh ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, labelCapacityAh: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={draft.labelVerified}
                onChange={(e) => setDraft({ ...draft, labelVerified: e.target.checked })}
              />
              Valores conferidos na etiqueta da bateria
            </label>
            <Field label="Observações">
              <input
                className="input"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <div className="col-span-2">
              <Button variant="primary" type="submit">
                Salvar
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-400">Etiqueta</dt>
            <dd>
              {profile.labelVoltageV ?? '?'} V / {profile.labelCapacityAh ?? '?'} Ah{' '}
              <span className={profile.labelVerified ? 'text-emerald-400' : 'text-amber-300'}>
                ({profile.labelVerified ? 'conferida' : 'hipótese — conferir etiqueta'})
              </span>
            </dd>
            <dt className="text-slate-400">Energia nominal</dt>
            <dd>
              {fmtValue(nominal.value, 2)} kWh <OriginBadge origin="ESTIMADO" />
              <div className="text-[10px] text-slate-500">{nominal.method}</div>
            </dd>
            <dt className="text-slate-400">Nº de série</dt>
            <dd>{profile.serial || '—'}</dd>
            <dt className="text-slate-400">Notas</dt>
            <dd className="text-slate-400">{profile.notes || '—'}</dd>
          </dl>
        )}
      </div>
    </Card>
  );
}

export default function BatteriesPage() {
  const { value: bats, save } = useBatteries();
  const batteryCount = useApp((s) => s.vehicle.batteryCount);
  const { energy, energyEstimate } = useRangeEstimate();
  const readings = useCollection<ManualBatteryReading>('batteryReadings');
  const sessions = useCollection<ChargingSession>('chargingSessions');
  const [r, setR] = useState({ batteryId: 'battery-a' as BId, voltageV: '', socPercent: '', source: 'Painel TFT' });
  const [cs, setCs] = useState({
    batteryId: 'ambas' as ChargingSession['batteryId'],
    start: '',
    end: '',
    socStart: '',
    socEnd: '',
    energyKWh: '',
    location: '',
  });
  const num = (s: string) => (s === '' ? null : Number(s));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Baterias"
        subtitle="SOC = carga atual · SOH = saúde (capacidade efetiva / nominal) · Capacidade efetiva só pode ser obtida medindo energia em ciclo completo."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <BatteryCard id="battery-a" profile={bats.a} onSave={(p) => save({ ...bats, a: p })} />
        {batteryCount === 2 ? (
          <BatteryCard id="battery-b" profile={bats.b} onSave={(p) => save({ ...bats, b: p })} />
        ) : (
          <Card title="Bateria B">
            <EmptyTelemetry>Veículo configurado com 1 bateria (Configurações).</EmptyTelemetry>
          </Card>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Comparação A × B" className="lg:col-span-2">
          <TimeSeriesChart
            series={[
              { componentId: 'battery-a', quantity: 'soc', label: 'SOC A', color: '#34d399', unit: '%' },
              { componentId: 'battery-b', quantity: 'soc', label: 'SOC B', color: '#22d3ee', unit: '%' },
              { componentId: 'battery-a', quantity: 'voltage', label: 'Tensão A', color: '#fbbf24', unit: 'V' },
              { componentId: 'battery-b', quantity: 'voltage', label: 'Tensão B', color: '#f472b6', unit: 'V' },
            ]}
          />
        </Card>
        <Card title="Energia disponível">
          <Reading label="Estimativa" dv={energy} big digits={2} />
          <div className="mt-2 text-xs text-slate-400">
            <div>Método: {energyEstimate.method}</div>
            <ul className="mt-1 list-inside list-disc">
              {Object.entries(energyEstimate.inputs).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Registro manual de leitura">
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              readings.add({
                batteryId: r.batteryId,
                timestamp: Date.now(),
                voltageV: num(r.voltageV),
                socPercent: num(r.socPercent),
                source: r.source,
              });
              setR({ ...r, voltageV: '', socPercent: '' });
            }}
          >
            <Field label="Bateria">
              <select
                className="input"
                value={r.batteryId}
                onChange={(e) => setR({ ...r, batteryId: e.target.value as BId })}
              >
                <option value="battery-a">A</option>
                <option value="battery-b">B</option>
              </select>
            </Field>
            <Field label="Fonte da leitura">
              <input className="input" value={r.source} onChange={(e) => setR({ ...r, source: e.target.value })} />
            </Field>
            <Field label="SOC observado (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={r.socPercent}
                onChange={(e) => setR({ ...r, socPercent: e.target.value })}
              />
            </Field>
            <Field label="Tensão (V)" hint="Somente com equipamento e procedimento seguros.">
              <input
                className="input"
                type="number"
                step="0.1"
                value={r.voltageV}
                onChange={(e) => setR({ ...r, voltageV: e.target.value })}
              />
            </Field>
            <div className="col-span-2">
              <Button variant="primary" type="submit">
                Registrar
              </Button>
            </div>
          </form>
          {readings.error && <p className="mt-2 text-xs text-red-300">{readings.error}</p>}
          <table className="tbl mt-3">
            <thead>
              <tr>
                <th>Data</th>
                <th>Bat.</th>
                <th>SOC</th>
                <th>Tensão</th>
                <th>Fonte</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...readings.items]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 20)
                .map((x) => (
                  <tr key={x.id}>
                    <td className="text-xs">{new Date(x.timestamp).toLocaleString('pt-BR')}</td>
                    <td>{x.batteryId === 'battery-a' ? 'A' : 'B'}</td>
                    <td>{x.socPercent ?? '—'}%</td>
                    <td>{x.voltageV ?? '—'} V</td>
                    <td className="text-xs text-slate-400">{x.source}</td>
                    <td>
                      <button
                        onClick={() => readings.remove(x.id)}
                        aria-label="Excluir"
                        className="text-slate-500 hover:text-red-300"
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!readings.items.length && <p className="mt-2 text-xs text-slate-500">Nenhuma leitura manual.</p>}
        </Card>

        <Card title="Sessões de carga">
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sessions.add({
                batteryId: cs.batteryId,
                start: cs.start,
                end: cs.end,
                socStart: num(cs.socStart),
                socEnd: num(cs.socEnd),
                energyKWh: num(cs.energyKWh),
                location: cs.location,
              });
              setCs({ ...cs, start: '', end: '', socStart: '', socEnd: '', energyKWh: '' });
            }}
          >
            <Field label="Bateria">
              <select
                className="input"
                value={cs.batteryId}
                onChange={(e) => setCs({ ...cs, batteryId: e.target.value as ChargingSession['batteryId'] })}
              >
                <option value="ambas">Ambas</option>
                <option value="battery-a">A</option>
                <option value="battery-b">B</option>
              </select>
            </Field>
            <Field label="Local">
              <input
                className="input"
                value={cs.location}
                onChange={(e) => setCs({ ...cs, location: e.target.value })}
              />
            </Field>
            <Field label="Início">
              <input
                className="input"
                type="datetime-local"
                required
                value={cs.start}
                onChange={(e) => setCs({ ...cs, start: e.target.value })}
              />
            </Field>
            <Field label="Fim">
              <input
                className="input"
                type="datetime-local"
                value={cs.end}
                onChange={(e) => setCs({ ...cs, end: e.target.value })}
              />
            </Field>
            <Field label="SOC inicial (%)">
              <input
                className="input"
                type="number"
                value={cs.socStart}
                onChange={(e) => setCs({ ...cs, socStart: e.target.value })}
              />
            </Field>
            <Field label="SOC final (%)">
              <input
                className="input"
                type="number"
                value={cs.socEnd}
                onChange={(e) => setCs({ ...cs, socEnd: e.target.value })}
              />
            </Field>
            <Field label="Energia da rede (kWh)" hint="Ex.: medidor de tomada externo">
              <input
                className="input"
                type="number"
                step="0.01"
                value={cs.energyKWh}
                onChange={(e) => setCs({ ...cs, energyKWh: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button variant="primary" type="submit">
                Registrar carga
              </Button>
            </div>
          </form>
          <table className="tbl mt-3">
            <thead>
              <tr>
                <th>Início</th>
                <th>Bat.</th>
                <th>SOC</th>
                <th>kWh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...sessions.items]
                .sort((a, b) => b.start.localeCompare(a.start))
                .map((x) => (
                  <tr key={x.id}>
                    <td className="text-xs">{x.start ? new Date(x.start).toLocaleString('pt-BR') : '—'}</td>
                    <td>{x.batteryId === 'ambas' ? 'A+B' : x.batteryId === 'battery-a' ? 'A' : 'B'}</td>
                    <td>
                      {x.socStart ?? '?'}→{x.socEnd ?? '?'}%
                    </td>
                    <td>{x.energyKWh ?? '—'}</td>
                    <td>
                      <button
                        onClick={() => sessions.remove(x.id)}
                        aria-label="Excluir"
                        className="text-slate-500 hover:text-red-300"
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!sessions.items.length && <p className="mt-2 text-xs text-slate-500">Nenhuma sessão registrada.</p>}
        </Card>
      </div>
    </div>
  );
}
