import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { HARDWARE, useConnectionStatus, useReading } from '../../app/telemetry';
import { useRangeEstimate } from '../../app/vehicleData';
import { useCollection } from '../../data/hooks';
import type { DisplayValue } from '../../domain/origin';
import { ORIGIN_LABEL } from '../../domain/origin';
import type { ChargingSession, DashboardReading, DataOrigin, MaintenanceRecord } from '../../domain/types';
import { SimulationBanner, cx, fmtValue } from '../../shared/ui';
import { Icon, type IconName } from '../../shared/ui/icons';
import { VehicleScene } from '../vehicle-3d/VehicleScene';
import { runAutoScan, useScan } from '../scanner/autoScan';
import { DashboardReadingSheet, MODE_STYLE } from './DashboardReadingSheet';

/**
 * Tela inicial da moto (estilo app de veículo: nome e estado no topo, um número grande, a moto em
 * destaque, botões redondos e cartões). Tudo pensado para a Voltz EVS: autonomia, bateria(s) removível(is),
 * modo de condução, odômetro e trips — os mesmos números do painel TFT.
 *
 * Fontes, em ordem: telemetria ao vivo/estimativa (com origem) → última leitura digitada do painel
 * ("lido no painel", com data) → "--". Nada é inventado para preencher a tela.
 */

const ORIGIN_DOT: Record<DataOrigin, string> = {
  REAL: 'bg-origin-real',
  ESTIMADO: 'bg-origin-est',
  SIMULADO: 'bg-origin-sim',
  INDISPONIVEL: 'bg-origin-na',
};

const when = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Valor exibido + de onde veio (origem do app ou leitura manual do painel). */
interface Shown {
  value: number | null;
  source: { kind: 'origin'; dv: DisplayValue } | { kind: 'painel'; at: number } | { kind: 'nenhum' };
}

function pick(dv: DisplayValue, manual: number | null | undefined, at: number | undefined): Shown {
  if (dv.value != null) return { value: dv.value, source: { kind: 'origin', dv } };
  if (manual != null && at) return { value: manual, source: { kind: 'painel', at } };
  return { value: null, source: { kind: 'nenhum' } };
}

function Source({ s, className }: { s: Shown['source']; className?: string }) {
  const base = cx('inline-flex items-center gap-1 text-[11px] text-slate-500', className);
  if (s.kind === 'painel')
    return (
      <span className={base}>
        <Icon name="eye" className="h-3 w-3" /> lido no painel · {when(s.at)}
      </span>
    );
  const dv = s.kind === 'origin' ? s.dv : null;
  const origin: DataOrigin = dv?.origin ?? 'INDISPONIVEL';
  return (
    <span className={base}>
      <span className={cx('h-1.5 w-1.5 rounded-full', ORIGIN_DOT[origin])} />
      {dv?.stale ? 'desatualizado' : ORIGIN_LABEL[origin].toLowerCase()}
    </span>
  );
}

function BatteryBar({ label, s }: { label: string; s: Shown }) {
  const v = s.value;
  return (
    <div className="flex items-center gap-2">
      <Icon name="battery" className={cx('h-4 w-4', v == null ? 'text-slate-500' : 'text-emerald-400')} />
      <span className="text-xs text-slate-500">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-700">
        {v != null && (
          <span
            className={cx('block h-full rounded-full', v < 20 ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
          />
        )}
      </span>
      <span className="w-9 text-xs tabular-nums text-slate-400">{v == null ? '--' : `${fmtValue(v, 0)}%`}</span>
    </div>
  );
}

function RoundAction({
  icon,
  label,
  onClick,
  to,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <>
      <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-card text-slate-200 shadow-soft transition group-active:scale-95 dark:ring-1 dark:ring-ink-700">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="text-[11px] text-slate-500">{label}</span>
    </>
  );
  const cls = 'group flex flex-col items-center gap-1.5';
  return to ? (
    <Link to={to} onClick={onClick} className={cls} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls} aria-label={label}>
      {inner}
    </button>
  );
}

function Tile({
  icon,
  title,
  status,
  to,
  tone,
  children,
  className,
}: {
  icon: IconName;
  title: string;
  status?: ReactNode;
  to: string;
  tone?: 'ok' | 'warn' | 'muted';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cx('sheet flex flex-col p-4 transition active:scale-[0.98]', className)}>
      <div className="flex items-start gap-3">
        <Icon name={icon} className="mt-0.5 h-6 w-6 shrink-0 text-slate-300" />
        <div className="min-w-0">
          <div className="text-[15px] font-medium leading-snug text-fg">{title}</div>
          {status && (
            <div
              className={cx(
                'mt-0.5 text-[13px] leading-snug',
                tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-slate-500',
              )}
            >
              {status}
            </div>
          )}
        </div>
      </div>
      {children}
    </Link>
  );
}

function stateLabel(tone: 'ok' | 'sim' | 'off') {
  return tone === 'ok' ? 'Ao vivo' : tone === 'sim' ? 'Simulação' : 'Sem conexão';
}

const km = (v: number | null | undefined, d = 0) => (v == null ? '--' : `${fmtValue(v, d)} km`);

export default function HomePage() {
  const nav = useNavigate();
  const [reading, setReading] = useState(false);
  const vehicle = useApp((s) => s.vehicle);
  const alerts = useApp((s) => s.alerts);
  const conn = useConnectionStatus();
  const socA = useReading('battery-a', 'soc', '%');
  const socB = useReading('battery-b', 'soc', '%');
  const motorT = useReading('hub-motor', 'temperature', '°C');
  const odoLive = useReading('tft-dashboard', 'odometer', 'km');
  const { range } = useRangeEstimate();
  const lastSample = useApp((s) => {
    const all = [...Object.values(s.latest.REAL), ...Object.values(s.latest.SIMULADO)];
    return all.reduce((m, x) => Math.max(m, x.timestamp), 0);
  });
  const lastScan = useScan((s) => s.finishedAt);
  const { items: maint } = useCollection<MaintenanceRecord>('maintenance');
  const { items: charges } = useCollection<ChargingSession>('chargingSessions');
  const { items: panel } = useCollection<DashboardReading>('dashboardReadings');

  const lastPanel = [...panel].sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastMaint = [...maint].sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastCharge = [...charges].sort((a, b) => b.end.localeCompare(a.end))[0];
  const openAlerts = alerts.filter((a) => !a.endedAt && !a.acknowledgedAt);
  const gw = HARDWARE.map((a) => a.status()).find((st) => st.firmware);
  const twoPacks = vehicle.batteryCount === 2;

  const rangeS = pick(range, lastPanel?.rangeKm, lastPanel?.timestamp);
  const battA = pick(socA, lastPanel?.socPercent, lastPanel?.timestamp);
  const battB = pick(socB, null, undefined);
  const odo = pick(odoLive, lastPanel?.odometerKm, lastPanel?.timestamp);
  const mode = lastPanel?.mode ?? null;

  // O painel da EVS mostra uma única "capacidade da bateria"; com leitura só do painel, mostra uma barra
  const panelOnly = battA.source.kind === 'painel' && battB.value == null;
  const updatedAt = Math.max(lastSample, lastPanel?.timestamp ?? 0);

  return (
    <div className="-m-3 min-h-full pb-6 sm:-m-4 lg:m-0">
      {conn.tone === 'sim' && (
        <div className="px-4 pt-3">
          <SimulationBanner />
        </div>
      )}

      {/* Topo: moto + estado */}
      <section className="relative px-5 pt-6" style={{ backgroundImage: 'var(--hero-bg)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-fg">{vehicle.name}</h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-500">
              <span>{stateLabel(conn.tone)}</span>
              <span className="h-3 w-px bg-ink-600" />
              <span>Atualizado: {updatedAt ? when(updatedAt) : '—'}</span>
              <button
                onClick={() => nav('/scanner')}
                aria-label="Atualizar com o scanner"
                className="p-1 active:opacity-60"
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <Link
            to="/conta"
            aria-label="Minha conta"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-slate-300 shadow-soft lg:hidden"
          >
            <Icon name="user" className="h-5 w-5" />
          </Link>
        </div>

        {/* Autonomia — o número que importa para quem pilota */}
        <div className="mt-7 flex flex-col items-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Autonomia</div>
          <div className="mt-1 flex items-start text-fg">
            <span className="text-[76px] font-light leading-none tracking-tight tabular-nums">
              {rangeS.value == null ? '--' : fmtValue(rangeS.value, 0)}
            </span>
            <span className="ml-1 mt-2 text-lg font-light text-slate-400">km</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <BatteryBar label={panelOnly || !twoPacks ? 'Bateria' : 'A'} s={battA} />
            {twoPacks && !panelOnly && <BatteryBar label="B" s={battB} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
            <Source s={rangeS.value != null ? rangeS.source : battA.source} />
            {rangeS.value == null && battA.value == null && (
              <button onClick={() => setReading(true)} className="text-[11px] text-cyanx-300">
                ler o painel agora
              </button>
            )}
          </div>
          {/* Modo e odômetro, como no painel */}
          <div className="mt-3 flex items-center gap-2">
            {mode && (
              <span
                className={cx('rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest', MODE_STYLE[mode].cls)}
              >
                {MODE_STYLE[mode].label}
              </span>
            )}
            <span className="rounded-full bg-card/70 px-2.5 py-0.5 text-[11px] text-slate-400 shadow-soft">
              Total {km(odo.value)}
            </span>
          </div>
        </div>

        {/* A moto em destaque */}
        <Link to="/explorador" aria-label="Abrir o Explorador 3D" className="relative mx-auto block h-[220px] max-w-xl">
          <VehicleScene variant="showcase" preset="lateral" className="h-full w-full" />
          <span className="absolute bottom-1 right-1 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-slate-500">
            modelo provisório
          </span>
        </Link>

        {/* Ações da moto */}
        <div className="mx-auto mt-2 grid max-w-md grid-cols-4 gap-2 pb-2">
          <RoundAction icon="eye" label="Ler painel" onClick={() => setReading(true)} />
          <RoundAction icon="battery" label="Recarga" to="/baterias" />
          <RoundAction
            icon="radar"
            label="Escanear"
            to="/scanner"
            onClick={() => {
              if (!useScan.getState().running) void runAutoScan();
            }}
          />
          <RoundAction icon="plug" label="Gateway" to="/conectividade" />
        </div>
      </section>

      {/* Cartões da moto */}
      <section className="mx-auto mt-4 grid max-w-3xl grid-cols-2 gap-3 px-4">
        <Tile icon="motor" title="Motor no cubo" to="/sensores" className="row-span-2">
          <div className="mt-auto pt-4">
            <div className="flex items-start text-fg">
              <span className="text-[44px] font-light leading-none tabular-nums">
                {motorT.value == null ? '--' : fmtValue(motorT.value, 1)}
              </span>
              <span className="ml-0.5 mt-1 text-lg font-light text-slate-400">°C</span>
            </div>
            <div className="mt-1 text-[13px] text-slate-500">Temperatura do motor (roda traseira)</div>
            <Source s={{ kind: 'origin', dv: motorT }} className="mt-1" />
          </div>
        </Tile>

        <Tile
          icon="battery"
          title={twoPacks ? 'Baterias A e B' : 'Bateria'}
          to="/baterias"
          status={
            socA.value == null && socB.value == null
              ? 'Removíveis · sem leitura ao vivo'
              : `A ${fmtValue(socA.value, 0)}%${twoPacks ? ` · B ${fmtValue(socB.value, 0)}%` : ''}`
          }
        />
        <Tile
          icon="alert"
          title="Alertas"
          to="/diagnostico"
          status={openAlerts.length ? `${openAlerts.length} ativo(s)` : 'Normal'}
          tone={openAlerts.length ? 'warn' : undefined}
        />

        <Tile
          icon="chart"
          title="Viagem"
          to="/telemetria"
          status={
            lastPanel?.tripAKm != null || lastPanel?.tripBKm != null
              ? `Trip A ${km(lastPanel?.tripAKm, 1)} · B ${km(lastPanel?.tripBKm, 1)}`
              : 'Trips A/B: leia no painel'
          }
        />
        <Tile
          icon="pulse"
          title="Recarga"
          to="/baterias"
          status={
            lastCharge
              ? `Última: ${new Date(lastCharge.end).toLocaleDateString('pt-BR')}${lastCharge.socEnd != null ? ` · ${lastCharge.socEnd}%` : ''}`
              : 'Nenhuma registrada'
          }
        />

        <Tile icon="tire" title="Pneus" to="/manutencao" status="Calibragem: registrar" />
        <Tile
          icon="wrench"
          title="Revisão"
          to="/manutencao"
          status={
            lastMaint
              ? `Última: ${new Date(lastMaint.date).toLocaleDateString('pt-BR')} · ${fmtValue(lastMaint.odometerKm, 0)} km`
              : 'Sem registros'
          }
        />

        <Tile
          icon="plug"
          title="Gateway"
          to="/conectividade"
          status={gw ? `${gw.firmware!.name} v${gw.firmware!.version}` : 'Desconectado'}
          tone={gw ? 'ok' : 'muted'}
        />
        <Tile
          icon="radar"
          title="Scanner"
          to="/scanner"
          status={lastScan ? `Último: ${when(lastScan)}` : 'Nunca executado'}
        />

        <Link to="/tecnico" className="sheet col-span-2 flex items-center gap-3 p-4 active:scale-[0.99]">
          <Icon name="home" className="h-6 w-6 text-slate-300" />
          <div className="flex-1">
            <div className="text-[15px] font-medium text-fg">Central técnica</div>
            <div className="text-[13px] text-slate-500">3D, árvore de peças, telemetria e cobertura</div>
          </div>
          <Icon name="chevron" className="h-4 w-4 text-slate-500" />
        </Link>
      </section>

      {reading && <DashboardReadingSheet onClose={() => setReading(false)} last={lastPanel} />}
    </div>
  );
}
