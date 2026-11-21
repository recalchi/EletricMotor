import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from '../../app/store';
import { HARDWARE, useConnectionStatus, useReading } from '../../app/telemetry';
import { useRangeEstimate } from '../../app/vehicleData';
import { useCollection } from '../../data/hooks';
import type { DisplayValue } from '../../domain/origin';
import { ORIGIN_LABEL } from '../../domain/origin';
import type { DataOrigin, MaintenanceRecord } from '../../domain/types';
import { SimulationBanner, cx, fmtValue } from '../../shared/ui';
import { Icon, type IconName } from '../../shared/ui/icons';
import { VehicleScene } from '../vehicle-3d/VehicleScene';
import { runAutoScan, useScan } from '../scanner/autoScan';

/**
 * Tela inicial no estilo "app de carro": nome do veículo e estado no topo, um número grande, a moto em
 * destaque, botões redondos e cartões em duas colunas. Regra do projeto mantida: todo valor mostra a
 * origem (ponto colorido + rótulo) e "—" quando não há leitura — nada é inventado para preencher a tela.
 */

const ORIGIN_DOT: Record<DataOrigin, string> = {
  REAL: 'bg-origin-real',
  ESTIMADO: 'bg-origin-est',
  SIMULADO: 'bg-origin-sim',
  INDISPONIVEL: 'bg-origin-na',
};

function Origin({ dv, className }: { dv: DisplayValue; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[11px] text-slate-500', className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', ORIGIN_DOT[dv.origin])} />
      {dv.stale ? 'desatualizado' : ORIGIN_LABEL[dv.origin].toLowerCase()}
    </span>
  );
}

function BatteryBar({ label, dv }: { label: string; dv: DisplayValue }) {
  const v = dv.value;
  return (
    <div className="flex items-center gap-2">
      <Icon name="battery" className={cx('h-4 w-4', v == null ? 'text-slate-500' : 'text-emerald-400')} />
      <span className="text-xs text-slate-500">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
        {v != null && (
          <span
            className={cx('block h-full rounded-full', v < 20 ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
          />
        )}
      </span>
      <span className="w-9 text-xs tabular-nums text-slate-400">{v == null ? '—' : `${fmtValue(v, 0)}%`}</span>
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
  to: string;
}) {
  return (
    <Link to={to} onClick={onClick} className="group flex flex-col items-center gap-1.5" aria-label={label}>
      <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-card text-slate-200 shadow-soft transition group-active:scale-95 dark:ring-1 dark:ring-ink-700">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="text-[11px] text-slate-500">{label}</span>
    </Link>
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

export default function HomePage() {
  const nav = useNavigate();
  const vehicle = useApp((s) => s.vehicle);
  const alerts = useApp((s) => s.alerts);
  const conn = useConnectionStatus();
  const socA = useReading('battery-a', 'soc', '%');
  const socB = useReading('battery-b', 'soc', '%');
  const motorT = useReading('hub-motor', 'temperature', '°C');
  const { range } = useRangeEstimate();
  const lastSample = useApp((s) => {
    const all = [...Object.values(s.latest.REAL), ...Object.values(s.latest.SIMULADO)];
    return all.reduce((m, x) => Math.max(m, x.timestamp), 0);
  });
  const lastScan = useScan((s) => s.finishedAt);
  const { items: maint } = useCollection<MaintenanceRecord>('maintenance');
  const openAlerts = alerts.filter((a) => !a.endedAt && !a.acknowledgedAt);
  const lastMaint = [...maint].sort((a, b) => b.date.localeCompare(a.date))[0];
  const gw = HARDWARE.map((a) => a.status()).find((st) => st.firmware);

  // Número principal: autonomia; sem ela, carga da bateria A; sem nenhuma, "—"
  const main: { dv: DisplayValue; unit: string } =
    range.value != null
      ? { dv: range, unit: 'km' }
      : socA.value != null
        ? { dv: socA, unit: '%' }
        : { dv: range, unit: 'km' };

  const updated = lastSample
    ? new Date(lastSample).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="-m-3 min-h-full pb-6 sm:-m-4 lg:m-0">
      {conn.tone === 'sim' && (
        <div className="px-4 pt-3">
          <SimulationBanner />
        </div>
      )}

      {/* Topo: veículo + estado */}
      <section className="relative px-5 pt-6" style={{ backgroundImage: 'var(--hero-bg)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-fg">{vehicle.name}</h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-500">
              <span>{stateLabel(conn.tone)}</span>
              <span className="h-3 w-px bg-ink-600" />
              <span>Atualizado: {updated}</span>
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

        {/* Número principal */}
        <div className="mt-8 flex flex-col items-center">
          <div className="flex items-start text-fg">
            <span className="text-[76px] font-light leading-none tracking-tight tabular-nums">
              {main.dv.value == null ? '--' : fmtValue(main.dv.value, 0)}
            </span>
            <span className="ml-1 mt-2 text-lg font-light text-slate-400">{main.unit}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <BatteryBar label="A" dv={socA} />
            {vehicle.batteryCount === 2 && <BatteryBar label="B" dv={socB} />}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Origin dv={main.dv} />
            {main.dv.value == null && (
              <Link to="/scanner" className="text-[11px] text-cyanx-300">
                conectar para ver a bateria
              </Link>
            )}
          </div>
        </div>

        {/* A moto em destaque */}
        <Link to="/explorador" aria-label="Abrir o Explorador 3D" className="relative mx-auto block h-[230px] max-w-xl">
          <VehicleScene variant="showcase" preset="lateral" className="h-full w-full" />
          <span className="absolute bottom-1 right-1 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-slate-500">
            modelo provisório
          </span>
        </Link>

        {/* Botões redondos */}
        <div className="mx-auto mt-2 grid max-w-md grid-cols-4 gap-2 pb-2">
          <RoundAction
            icon="radar"
            label="Escanear"
            to="/scanner"
            onClick={() => {
              if (!useScan.getState().running) void runAutoScan();
            }}
          />
          <RoundAction icon="plug" label="Gateway" to="/conectividade" />
          <RoundAction icon="thermo" label="Sensores" to="/sensores" />
          <RoundAction icon="report" label="Relatório" to="/relatorios/tecnico" />
        </div>
      </section>

      {/* Cartões */}
      <section className="mx-auto mt-4 grid max-w-3xl grid-cols-2 gap-3 px-4">
        <Tile icon="thermo" title="Motor" to="/sensores" className="row-span-2">
          <div className="mt-auto pt-4">
            <div className="flex items-start text-fg">
              <span className="text-[44px] font-light leading-none tabular-nums">
                {motorT.value == null ? '--' : fmtValue(motorT.value, 1)}
              </span>
              <span className="ml-0.5 mt-1 text-lg font-light text-slate-400">°C</span>
            </div>
            <div className="mt-1 text-[13px] text-slate-500">Temperatura do motor hub</div>
            <Origin dv={motorT} className="mt-1" />
          </div>
        </Tile>

        <Tile
          icon="battery"
          title="Baterias"
          to="/baterias"
          status={
            socA.value == null && socB.value == null
              ? 'Sem leitura'
              : `A ${fmtValue(socA.value, 0)}%${vehicle.batteryCount === 2 ? ` · B ${fmtValue(socB.value, 0)}%` : ''}`
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
          status={
            lastScan
              ? `Último: ${new Date(lastScan).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'Nunca executado'
          }
        />

        <Tile
          icon="wrench"
          title="Manutenção"
          to="/manutencao"
          status={lastMaint ? `Última: ${new Date(lastMaint.date).toLocaleDateString('pt-BR')}` : 'Sem registros'}
        />
        <Tile icon="tire" title="Pneus" to="/sensores" status="Sem sensor instalado" />

        <Tile icon="cube" title="Explorador 3D" to="/explorador" status="Peças e sistemas" />
        <Tile icon="chart" title="Central técnica" to="/tecnico" status="Painel completo" />
      </section>
    </div>
  );
}
