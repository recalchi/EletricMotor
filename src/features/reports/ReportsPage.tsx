import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCollection } from '../../data/hooks';
import { CATALOG, getComponent } from '../../domain/catalog';
import { COVERAGE_LABEL } from '../../domain/coverage';
import type {
  AuditEntry,
  ChargingSession,
  MaintenanceRecord,
  ManualBatteryReading,
  ManualInspection,
  Symptom,
} from '../../domain/types';
import { downloadText, toCsv } from '../../integrations/csv';
import { Button, Card, PageHeader } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const stamp = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const maint = useCollection<MaintenanceRecord>('maintenance');
  const insp = useCollection<ManualInspection>('inspections');
  const charge = useCollection<ChargingSession>('chargingSessions');
  const reads = useCollection<ManualBatteryReading>('batteryReadings');
  const symptoms = useCollection<Symptom>('symptoms');
  const alerts = useApp((s) => s.alerts);
  const auditLog = useCollection<AuditEntry>('auditLog');
  const auditSorted = [...auditLog.items].sort((a, b) => b.at - a.at);

  const reports = [
    {
      name: 'Manutenção',
      desc: 'Serviços, peças, custos (BRL), odômetro.',
      count: maint.items.length,
      run: () =>
        toCsv(
          maint.items.map((r) => ({ ...r, component: getComponent(r.componentId)?.name })),
          ['date', 'odometerKm', 'componentId', 'component', 'kind', 'description', 'parts', 'costBRL', 'workshop'],
        ),
    },
    {
      name: 'Inspeções manuais',
      desc: 'Condição por componente (origem: inspeção manual).',
      count: insp.items.length,
      run: () => toCsv(insp.items as never, ['date', 'componentId', 'condition', 'notes']),
    },
    {
      name: 'Sessões de carga',
      desc: 'Início/fim (horário local), SOC, energia da rede (kWh).',
      count: charge.items.length,
      run: () =>
        toCsv(charge.items as never, ['batteryId', 'start', 'end', 'socStart', 'socEnd', 'energyKWh', 'location']),
    },
    {
      name: 'Leituras manuais de bateria',
      desc: 'Timestamp UTC, SOC (%), tensão (V) e fonte da leitura.',
      count: reads.items.length,
      run: () =>
        toCsv(
          reads.items.map((r) => ({ ...r, timestamp_utc: new Date(r.timestamp).toISOString() })),
          ['timestamp_utc', 'batteryId', 'socPercent', 'voltageV', 'source'],
        ),
    },
    {
      name: 'Sintomas',
      desc: 'Sintomas relatados e status.',
      count: symptoms.items.length,
      run: () => toCsv(symptoms.items as never, ['date', 'componentId', 'description', 'status']),
    },
    {
      name: 'Alertas (sessão atual)',
      desc: 'Inclui coluna de origem (SIMULADO/REAL).',
      count: alerts.length,
      run: () =>
        toCsv(
          alerts.map((a) => ({
            ...a,
            startedAt: new Date(a.startedAt).toISOString(),
            endedAt: a.endedAt ? new Date(a.endedAt).toISOString() : '',
          })),
          ['startedAt', 'endedAt', 'severity', 'title', 'message', 'componentId', 'origin', 'acknowledgedAt'],
        ),
    },
    {
      name: 'Matriz de cobertura',
      desc: 'Componente × cobertura × sinais disponíveis.',
      count: CATALOG.length,
      run: () =>
        toCsv(
          CATALOG.map((c) => ({
            id: c.id,
            name: c.name,
            group: c.group,
            coverage: COVERAGE_LABEL[c.coverage],
            signals: c.signals.map((s) => `${s.quantity}:${s.availability}`).join(' | '),
          })),
          ['id', 'name', 'group', 'coverage', 'signals'],
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Relatórios"
        subtitle="Relatório técnico em PDF e exportações CSV com unidades, intervalo e origem dos dados."
      />
      <Card title="Relatório técnico (PDF)">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-400">
            Documento consolidado: baterias, cobertura de monitoramento, serviços e custos, inspeções com fotos,
            recargas, sintomas, alertas com origem e especificações pendentes. Filtro por período.
          </p>
          <Link to="/relatorios/tecnico">
            <Button variant="primary">
              <Icon name="printer" /> Abrir relatório técnico
            </Button>
          </Link>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.name} title={r.name}>
            <p className="mb-3 text-sm text-slate-400">{r.desc}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{r.count} registro(s)</span>
              <Button
                disabled={!r.count}
                onClick={() => downloadText(`${r.name.toLowerCase().replace(/\s+/g, '-')}-${stamp()}.csv`, r.run())}
              >
                <Icon name="download" /> CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Card
        title="Trilha de auditoria"
        right={
          <Button
            disabled={!auditSorted.length}
            onClick={() =>
              downloadText(
                `auditoria-${stamp()}.csv`,
                toCsv(
                  auditSorted.map((a) => ({ ...a, at_utc: new Date(a.at).toISOString() })),
                  ['at_utc', 'actor', 'action', 'collection', 'docId', 'summary'],
                ),
              )
            }
          >
            <Icon name="download" /> CSV
          </Button>
        }
      >
        {auditSorted.length ? (
          <ul className="max-h-72 space-y-0.5 overflow-auto text-xs">
            {auditSorted.slice(0, 200).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="font-mono text-slate-500">{new Date(a.at).toLocaleString('pt-BR')}</span>
                <span
                  className={
                    a.action === 'excluir' ? 'text-red-300' : a.action === 'criar' ? 'text-emerald-300' : 'text-sky-300'
                  }
                >
                  {a.action}
                </span>
                <span className="text-slate-300">{a.collection}</span>
                <span className="truncate text-slate-400">{a.summary}</span>
                <span className="ml-auto text-slate-500">{a.actor}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Nenhuma alteração registrada ainda.</p>
        )}
      </Card>
    </div>
  );
}
