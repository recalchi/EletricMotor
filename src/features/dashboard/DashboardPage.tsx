import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useConnectionStatus, useReading, useNow, useEffectiveCoverage } from '../../app/telemetry';
import { useRangeEstimate } from '../../app/vehicleData';
import { getComponent } from '../../domain/catalog';
import type { DisplayValue } from '../../domain/origin';
import { useCollection } from '../../data/hooks';
import type { MaintenanceRecord } from '../../domain/types';
import { Bar, Card, OriginBadge, Reading, SimulationBanner, StaleBadge, cx, fmtValue } from '../../shared/ui';
import { TimeSeriesChart } from '../../shared/ui/charts';
import { Icon, type IconName } from '../../shared/ui/icons';
import { ComponentPanel } from '../components/ComponentPanel';
import { ComponentTree } from '../components/ComponentTree';
import { SceneToolbar, SensorLegend } from '../vehicle-3d/SceneToolbar';
import { VehicleScene, type CameraPreset } from '../vehicle-3d/VehicleScene';
import { ScanHero } from '../scanner/ScannerPage';

function Kpi({
  icon,
  label,
  dv,
  bar,
  extra,
  digits = 0,
}: {
  icon: IconName;
  label: string;
  dv: DisplayValue;
  bar?: boolean;
  extra?: string;
  digits?: number;
}) {
  return (
    <div className="panel flex items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-3">
      <Icon name={icon} className="h-6 w-6 shrink-0 text-cyanx-400 sm:h-7 sm:w-7" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase leading-tight tracking-[0.08em] text-slate-400 sm:truncate sm:tracking-[0.14em]">
          {label}
        </div>
        <div className={cx('font-mono text-xl tabular-nums', dv.value == null ? 'text-slate-500' : 'text-white')}>
          {fmtValue(dv.value, digits)}
          {dv.value != null && <span className="ml-1 text-xs text-slate-400">{dv.unit}</span>}
        </div>
        {bar && <Bar value={dv.value} tone={(dv.value ?? 0) < 20 ? 'amber' : 'cyan'} />}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <OriginBadge origin={dv.origin} />
          {dv.stale && <StaleBadge />}
          {extra && <span className="text-[10px] leading-tight text-slate-500">{extra}</span>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [nonce, setNonce] = useState(0);
  const conn = useConnectionStatus();
  const batteryCount = useApp((s) => s.vehicle.batteryCount);
  const alerts = useApp((s) => s.alerts);
  const simEvents = useApp((s) => s.simEvents);
  const socA = useReading('battery-a', 'soc', '%');
  const socB = useReading('battery-b', 'soc', '%');
  const odo = useReading('tft-dashboard', 'odometer', 'km');
  const motorT = useReading('hub-motor', 'temperature', '°C');
  const { range, energy } = useRangeEstimate();
  const { summary: cov } = useEffectiveCoverage();
  const now = useNow(5000);
  const { items: maint } = useCollection<MaintenanceRecord>('maintenance');
  const openAlerts = alerts.filter((a) => !a.endedAt && !a.acknowledgedAt);

  const alertDv: DisplayValue = {
    value: openAlerts.length,
    unit: '',
    origin: conn.tone === 'sim' || openAlerts.some((a) => a.origin === 'SIMULADO') ? 'SIMULADO' : 'ESTIMADO',
    timestamp: now,
    stale: false,
  };
  const lastMaint = [...maint].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="space-y-3">
      {conn.tone === 'sim' && <SimulationBanner />}

      {/* Ação principal: descobrir e monitorar automaticamente */}
      <ScanHero compact />

      {/* Faixa de indicadores */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon="battery" label="Bateria A — SOC" dv={socA} bar />
        <Kpi
          icon="battery"
          label="Bateria B — SOC"
          dv={batteryCount === 2 ? socB : { ...socB, value: null, origin: 'INDISPONIVEL' }}
          bar
          extra={batteryCount === 1 ? 'não instalada' : undefined}
        />
        <Kpi
          icon="pulse"
          label="Autonomia estimada"
          dv={range}
          extra={range.origin === 'INDISPONIVEL' ? 'informe consumo em Configurações' : undefined}
        />
        <Kpi icon="chart" label="Energia disponível" dv={energy} digits={2} />
        <Kpi icon="gear" label="Odômetro" dv={odo} />
        <Kpi icon="alert" label="Alertas ativos" dv={alertDv} />
      </div>

      {/* Centro */}
      <div className="grid gap-3 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[230px_1fr_340px]">
        <div className="panel hidden max-h-[560px] p-3 2xl:block">
          <ComponentTree className="h-full" />
        </div>
        <div className="panel relative h-[400px] overflow-hidden sm:h-[460px] xl:h-[560px]">
          <div className="absolute inset-x-2 top-10 z-10">
            <SceneToolbar
              onPreset={(p) => {
                setPreset(p);
                setNonce((n) => n + 1);
              }}
            />
          </div>
          <VehicleScene preset={preset} presetNonce={nonce} />
          <SensorLegend />
        </div>
        <div className="panel max-h-[560px] overflow-auto p-4">
          <ComponentPanel compact />
        </div>
      </div>

      {/* Inferior */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Desempenho das baterias" className="lg:col-span-2">
          <TimeSeriesChart
            series={[
              { componentId: 'battery-a', quantity: 'soc', label: 'SOC A', color: '#34d399', unit: '%' },
              { componentId: 'battery-b', quantity: 'soc', label: 'SOC B', color: '#22d3ee', unit: '%' },
              { componentId: 'battery-a', quantity: 'current', label: 'Corrente A', color: '#fb923c', unit: 'A' },
              { componentId: 'battery-a', quantity: 'temperature', label: 'Temp. A', color: '#818cf8', unit: '°C' },
            ]}
          />
        </Card>
        <Card
          title="Estado da aquisição"
          right={
            <Link to="/conectividade" className="text-xs text-cyanx-300">
              Detalhes →
            </Link>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fonte</span>
              <span className={conn.tone === 'sim' ? 'text-amber-300' : 'text-slate-300'}>{conn.label}</span>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Componentes medidos diretamente</span>
                <span className="font-mono">
                  {cov.counts.medido}/{cov.total}
                </span>
              </div>
              <Bar value={cov.measuredPercent} tone="green" />
              <p className="mt-1 text-[11px] text-slate-500">
                {cov.counts.medido
                  ? 'Medição direta via dispositivos externos validados. '
                  : 'Nenhum dispositivo validado ainda. '}
                {cov.counts.estimado} estimados, {cov.counts.inspecao_manual} por inspeção manual,{' '}
                {cov.counts.nao_coberto} não cobertos.{' '}
                <Link to="/manual" className="text-cyanx-300">
                  Ver matriz
                </Link>
              </p>
            </div>
            <Reading label="Temperatura do motor hub" dv={motorT} />
            {!socA.value && conn.tone === 'off' && (
              <Link
                to="/laboratorio"
                className="block rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200"
              >
                Sem dados. Abra o <b>Laboratório</b> para iniciar o simulador →
              </Link>
            )}
          </div>
        </Card>
        <Card title="Eventos e falhas" className="lg:col-span-2">
          {openAlerts.length === 0 && simEvents.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum alerta ou evento registrado.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto text-sm">
              {openAlerts.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span
                    className={cx(
                      'h-2 w-2 rounded-full',
                      a.severity === 'critico' ? 'bg-red-500' : a.severity === 'aviso' ? 'bg-amber-400' : 'bg-sky-400',
                    )}
                  />
                  <span className="text-slate-200">{a.title}</span>
                  <span className="text-slate-500">{a.message}</span>
                  <OriginBadge origin={a.origin} className="ml-auto" />
                </li>
              ))}
              {simEvents.slice(0, 8).map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-slate-500">{new Date(e.at).toLocaleTimeString('pt-BR')}</span>
                  {e.message}
                  <OriginBadge origin="SIMULADO" className="ml-auto" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Manutenção"
          right={
            <Link to="/manutencao" className="text-xs text-cyanx-300">
              Abrir →
            </Link>
          }
        >
          {lastMaint ? (
            <div className="text-sm">
              <div className="text-slate-400">Último registro</div>
              <div className="text-slate-200">
                {new Date(lastMaint.date + 'T12:00').toLocaleDateString('pt-BR')} —{' '}
                {getComponent(lastMaint.componentId)?.name}
              </div>
              <div className="text-xs text-slate-500">{lastMaint.description}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma manutenção registrada. Registre revisões, peças e custos.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
