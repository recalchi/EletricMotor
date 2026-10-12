import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useReading } from '../../app/telemetry';
import { CATALOG_BY_ID, GROUP_LABELS } from '../../domain/catalog';
import { COVERAGE_LABEL } from '../../domain/coverage';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import type { SignalDefinition } from '../../domain/types';
import { Button, EmptyTelemetry, EvidenceBadge, Reading } from '../../shared/ui';

/** Componentes cujos sinais também aparecem ao selecionar outro (ex.: roda traseira → motor + controladora). */
const RELATED: Record<string, string[]> = {
  'wheel-rear': ['hub-motor', 'motor-controller'],
  'bms-a': ['battery-a'],
  'bms-b': ['battery-b'],
  'tire-front': ['wheel-front'],
  'tire-rear': ['wheel-rear'],
};

const Q_LABEL: Record<string, string> = {
  voltage: 'Tensão',
  current: 'Corrente',
  power: 'Potência',
  temperature: 'Temperatura',
  soc: 'SOC',
  soh: 'SOH',
  speed: 'Velocidade',
  rpm: 'Rotação',
  energy: 'Energia',
  pressure: 'Pressão',
  vibration: 'Vibração',
  cycles: 'Ciclos',
  odometer: 'Odômetro',
};

const AVAIL: Record<SignalDefinition['availability'], string> = {
  validado: 'Interface validada',
  a_investigar: 'Interface a investigar',
  sensor_futuro: 'Sensor futuro proposto',
};

function SignalReading({ componentId, s }: { componentId: string; s: SignalDefinition }) {
  const dv = useReading(componentId, s.quantity, s.unit);
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850/60 p-2">
      <Reading label={Q_LABEL[s.quantity] ?? s.quantity} dv={dv} />
      <div className="mt-1 text-[10px] text-slate-500">{AVAIL[s.availability]}</div>
    </div>
  );
}

export function ComponentPanel({ compact }: { compact?: boolean }) {
  const id = useApp((s) => s.selectedId);
  const isolateId = useApp((s) => s.isolateId);
  const isolate = useApp((s) => s.isolate);
  const c = id ? CATALOG_BY_ID[id] : undefined;

  if (!c)
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-slate-400">
        <div className="mb-2 text-cyanx-300">Clique em um componente</div>
        no modelo 3D ou na árvore para ver ficha técnica, leituras disponíveis e próximos passos.
      </div>
    );

  const signalsOf = [c.id, ...(RELATED[c.id] ?? [])].map((cid) => ({
    comp: CATALOG_BY_ID[cid],
    signals: CATALOG_BY_ID[cid].signals,
  }));
  const anySignals = signalsOf.some((x) => x.signals.length);
  const sensors = SENSOR_CANDIDATES.filter((s) => s.componentId === c.id);
  const deepLink: Record<string, string> = {
    'battery-a': '/baterias',
    'battery-b': '/baterias',
    'hub-motor': '/motor',
    'wheel-rear': '/motor',
    'motor-controller': '/motor',
  };

  return (
    <div className="space-y-4 text-sm" data-testid="component-panel">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{GROUP_LABELS[c.group]}</div>
        <h3 className="text-lg font-semibold text-white">{c.name}</h3>
        <p className="text-slate-400">{c.description}</p>
        <p className="mt-1 text-xs text-slate-500">
          <span className="text-slate-400">Função:</span> {c.function}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-ink-700 px-2 py-0.5 text-slate-300">Cobertura: {COVERAGE_LABEL[c.coverage]}</span>
          <span className="font-mono text-[10px] text-slate-500">id: {c.id}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => isolate(isolateId === c.id ? null : c.id)}>
            {isolateId === c.id ? 'Sair do isolamento' : 'Isolar'}
          </Button>
          {deepLink[c.id] && (
            <Link to={deepLink[c.id]}>
              <Button variant="ghost">Abrir painel →</Button>
            </Link>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyanx-300">Leituras</h4>
        {anySignals ? (
          signalsOf.map(
            ({ comp, signals }) =>
              signals.length > 0 && (
                <div key={comp.id} className="mb-2">
                  {comp.id !== c.id && <div className="mb-1 text-xs text-slate-400">{comp.name}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    {signals.map((s) => (
                      <SignalReading key={s.quantity} componentId={comp.id} s={s} />
                    ))}
                  </div>
                </div>
              ),
          )
        ) : (
          <EmptyTelemetry>
            Este componente não possui grandeza mensurável cadastrada. Acompanhe por inspeção manual.
          </EmptyTelemetry>
        )}
      </div>

      {!compact && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyanx-300">Especificações</h4>
          {c.specs.length ? (
            <table className="tbl">
              <tbody>
                {c.specs.map((s) => (
                  <tr key={s.label}>
                    <td className="text-slate-400">{s.label}</td>
                    <td>
                      <div className="text-slate-200">{s.value}</div>
                      {s.note && <div className="text-[11px] text-slate-500">{s.note}</div>}
                    </td>
                    <td className="text-right">
                      <EvidenceBadge status={s.evidence} />
                      <div className="mt-0.5 text-[10px] text-slate-500">{s.source}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500">Nenhuma especificação cadastrada — aguardando documentação.</p>
          )}
        </div>
      )}

      {c.maintenanceRule && (
        <div className="rounded-md border border-violet-400/30 bg-violet-500/5 p-2 text-xs">
          <div className="font-medium text-violet-300">Regra operacional de manutenção</div>
          <div className="text-slate-300">
            {c.maintenanceRule.task}
            {c.maintenanceRule.everyKm && ` · a cada ${c.maintenanceRule.everyKm.toLocaleString('pt-BR')} km`}
            {c.maintenanceRule.everyDays && ` · a cada ${c.maintenanceRule.everyDays} dias`}
          </div>
          <div className="text-[10px] text-slate-500">Lembrete por uso/data — não é prova de falha física.</div>
        </div>
      )}

      {sensors.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-proposal">
            Instrumentação proposta
          </h4>
          <ul className="space-y-1 text-xs">
            {sensors.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-proposal" />
                <Link to="/sensores" className="text-slate-300 hover:text-white">
                  {s.name}
                </Link>
                <span className="text-slate-500">({s.status === 'proposto' ? 'proposto' : 'em avaliação'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-ink-700 p-2 text-xs text-slate-400">
        <div className="mb-1 font-medium text-slate-300">Próximos passos</div>
        <ul className="list-inside list-disc space-y-0.5">
          {c.specs.some((s) => s.evidence !== 'documento' && s.evidence !== 'inspecao') && (
            <li>Confirmar especificações por manual, etiqueta ou inspeção.</li>
          )}
          {c.coverage === 'inspecao_manual' && (
            <li>
              Registrar inspeção em{' '}
              <Link to="/manutencao" className="text-cyanx-300">
                Manutenção
              </Link>
              .
            </li>
          )}
          {c.signals.some((s) => s.availability === 'a_investigar') && (
            <li>
              Investigar interface de leitura (ver{' '}
              <Link to="/manual" className="text-cyanx-300">
                Manual
              </Link>
              ).
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
