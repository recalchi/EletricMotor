import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useApp } from '../../app/store';
import { useEffectiveCoverage } from '../../app/telemetry';
import { useBatteries, useVehicleSettings } from '../../app/vehicleData';
import { useCollection } from '../../data/hooks';
import { CATALOG, getComponent } from '../../domain/catalog';
import { COVERAGE_LABEL } from '../../domain/coverage';
import { nominalEnergyKWh } from '../../domain/estimates';
import { ORIGIN_DESCRIPTION, ORIGIN_LABEL } from '../../domain/origin';
import type {
  ChargingSession,
  DataOrigin,
  MaintenanceRecord,
  ManualBatteryReading,
  ManualInspection,
  Symptom,
} from '../../domain/types';
import { Button } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const num = (v: number | null | undefined) => (v == null ? '?' : v.toLocaleString('pt-BR'));
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dt = (iso: string) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('pt-BR') : '—';
const inRange = (iso: string, from: string, to: string) => (!from || iso >= from) && (!to || iso.slice(0, 10) <= to);

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wider text-slate-800">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function T({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-xs italic text-slate-500">{empty}</p>;
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="border-b border-slate-400 px-1.5 py-1 text-left font-semibold text-slate-700">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="align-top odd:bg-slate-50">
            {r.map((c, j) => (
              <td key={j} className="border-b border-slate-200 px-1.5 py-1 text-slate-800">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ORIGIN_COLOR: Record<DataOrigin, string> = {
  REAL: 'border-green-600 text-green-700',
  ESTIMADO: 'border-sky-600 text-sky-700',
  SIMULADO: 'border-amber-600 text-amber-700',
  INDISPONIVEL: 'border-slate-500 text-slate-600',
};
const Tag = ({ o }: { o: DataOrigin }) => (
  <span className={`rounded border px-1 text-[9px] font-bold ${ORIGIN_COLOR[o]}`}>{ORIGIN_LABEL[o]}</span>
);

/** Relatório técnico consolidado, formatado como folha A4 para impressão / "Salvar como PDF". */
export default function TechnicalReport() {
  const { session } = useSession();
  const vehicle = useApp((s) => s.vehicle);
  const alerts = useApp((s) => s.alerts);
  const { value: bats } = useBatteries();
  const { value: settings } = useVehicleSettings();
  const maint = useCollection<MaintenanceRecord>('maintenance');
  const insp = useCollection<ManualInspection>('inspections');
  const charge = useCollection<ChargingSession>('chargingSessions');
  const reads = useCollection<ManualBatteryReading>('batteryReadings');
  const symptoms = useCollection<Symptom>('symptoms');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [withPhotos, setWithPhotos] = useState(true);
  const generated = useMemo(() => new Date(), []);

  const m = maint.items.filter((r) => inRange(r.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const ins = insp.items.filter((r) => inRange(r.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const cs = charge.items.filter((r) => inRange(r.start, from, to)).sort((a, b) => a.start.localeCompare(b.start));
  const rd = reads.items
    .filter((r) => inRange(new Date(r.timestamp).toISOString(), from, to))
    .sort((a, b) => a.timestamp - b.timestamp);
  const { summary: cov, items: covItems } = useEffectiveCoverage();
  const pendingSpecs = CATALOG.flatMap((c) =>
    c.specs.filter((s) => s.evidence !== 'documento' && s.evidence !== 'inspecao').map((s) => ({ c, s })),
  );
  const packs = [bats.a, ...(vehicle.batteryCount === 2 ? [bats.b] : [])];

  return (
    <div>
      {/* Controles (somente tela) */}
      <div className="mb-3 flex flex-wrap items-end gap-3 print:hidden">
        <Link to="/relatorios" className="text-sm text-cyanx-300">
          ← Relatórios
        </Link>
        <label className="text-xs text-slate-400">
          De
          <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-slate-400">
          Até
          <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
          Incluir fotos
        </label>
        <Button variant="primary" onClick={() => window.print()} className="ml-auto">
          <Icon name="printer" /> Gerar PDF / Imprimir
        </Button>
      </div>
      <p className="mb-3 text-xs text-slate-500 print:hidden">
        Na janela de impressão escolha <b>“Salvar como PDF”</b>. Margens padrão, papel A4.
      </p>

      {/* Folha */}
      <article
        data-testid="technical-report"
        className="mx-auto max-w-[210mm] bg-white p-8 text-slate-900 shadow-xl print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] text-sky-700">ELETRICMOTOR</div>
            <h1 className="text-xl font-bold">Relatório técnico — {vehicle.name}</h1>
            <div className="text-xs text-slate-600">
              {vehicle.model} · {vehicle.year ?? 'ano a confirmar'} · variante {vehicle.variant} ·{' '}
              {vehicle.batteryCount} bateria(s) · odômetro {vehicle.odometerKm.toLocaleString('pt-BR')} km (leitura do
              painel)
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-600">
            <div>Gerado em {generated.toLocaleString('pt-BR')}</div>
            <div>UTC {generated.toISOString().slice(0, 19).replace('T', ' ')}</div>
            <div>
              Período: {from ? dt(from) : 'início'} – {to ? dt(to) : 'hoje'}
            </div>
            <div>
              Responsável: {session?.email ?? session?.displayName} (
              {session?.mode === 'demo' ? 'dados locais' : 'Firestore'})
            </div>
          </div>
        </header>

        <div className="mb-6 rounded border border-slate-300 bg-slate-50 p-2 text-[10px] text-slate-700">
          <b>Origem dos dados:</b>{' '}
          {(Object.keys(ORIGIN_LABEL) as DataOrigin[]).map((o) => (
            <span key={o} className="mr-3">
              <Tag o={o} /> {ORIGIN_DESCRIPTION[o]}
            </span>
          ))}
          <div className="mt-1">
            Este relatório não constitui diagnóstico definitivo. Nenhuma interface eletrônica da moto foi validada; não
            há dados REAIS de telemetria.
          </div>
        </div>

        <Section n={1} title="Baterias">
          <T
            head={['Bateria', 'Instalada', 'Nº de série', 'Etiqueta', 'Energia nominal', 'Observações']}
            empty="—"
            rows={packs.map((b) => {
              const e = nominalEnergyKWh(b.labelVoltageV, b.labelCapacityAh);
              return [
                b.id === 'battery-a' ? 'A' : 'B',
                b.installed ? 'sim' : 'não',
                b.serial || '—',
                `${num(b.labelVoltageV)} V / ${num(b.labelCapacityAh)} Ah ${b.labelVerified ? '(conferida)' : '(hipótese)'}`,
                <>
                  {e.value == null ? '—' : num(e.value)} kWh <Tag o="ESTIMADO" />
                </>,
                b.notes,
              ];
            })}
          />
          <p className="mt-1 text-[10px] text-slate-600">
            SOH e ciclos: <Tag o="INDISPONIVEL" /> — exigem medição de capacidade em ciclo completo. Consumo de
            referência:{' '}
            {settings.consumptionWhKm
              ? `${settings.consumptionWhKm} Wh/km (${settings.consumptionSource || 'fonte não informada'})`
              : 'não informado'}
            .
          </p>
        </Section>

        <Section n={2} title="Cobertura de monitoramento">
          <p className="mb-1 text-[11px]">
            {cov.total} componentes cadastrados — medidos diretamente: <b>{cov.counts.medido}</b> ({cov.measuredPercent}
            %) · estimados: {cov.counts.estimado} · inspeção manual: {cov.counts.inspecao_manual} · não cobertos:{' '}
            {cov.counts.nao_coberto}.
          </p>
          <p className="text-[10px] text-slate-600">Componente cadastrado ≠ componente monitorado.</p>
        </Section>

        <Section n={3} title="Serviços de manutenção">
          <T
            head={['Data', 'km', 'Componente', 'Tipo', 'Descrição', 'Peças', 'Oficina', 'Custo']}
            empty="Nenhum serviço no período."
            rows={m.map((r) => [
              dt(r.date),
              r.odometerKm.toLocaleString('pt-BR'),
              getComponent(r.componentId)?.name,
              r.kind,
              <>
                {r.description}
                {withPhotos && !!r.photos?.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.photos.map((p) => (
                      <img key={p.path} src={p.url} alt={p.name} className="h-16 w-16 object-cover" />
                    ))}
                  </div>
                )}
              </>,
              r.parts,
              r.workshop,
              brl(r.costBRL),
            ])}
          />
          {m.length > 0 && (
            <p className="mt-1 text-right text-[11px] font-semibold">
              Total no período: {brl(m.reduce((s, r) => s + (r.costBRL || 0), 0))}
            </p>
          )}
        </Section>

        <Section n={4} title="Inspeções manuais">
          <T
            head={['Data', 'Componente', 'Condição', 'Observações']}
            empty="Nenhuma inspeção no período."
            rows={ins.map((r) => [
              dt(r.date),
              getComponent(r.componentId)?.name,
              r.condition === 'ok' ? 'OK' : r.condition === 'atencao' ? 'Atenção' : 'Substituir',
              <>
                {r.notes}
                {withPhotos && !!r.photos?.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.photos.map((p) => (
                      <img key={p.path} src={p.url} alt={p.name} className="h-16 w-16 object-cover" />
                    ))}
                  </div>
                )}
              </>,
            ])}
          />
        </Section>

        <Section n={5} title="Recargas e leituras manuais">
          <T
            head={['Início', 'Fim', 'Bateria', 'SOC', 'Energia da rede', 'Local']}
            empty="Nenhuma sessão de carga no período."
            rows={cs.map((r) => [
              r.start ? new Date(r.start).toLocaleString('pt-BR') : '—',
              r.end ? new Date(r.end).toLocaleString('pt-BR') : '—',
              r.batteryId === 'ambas' ? 'A+B' : r.batteryId === 'battery-a' ? 'A' : 'B',
              `${r.socStart ?? '?'} → ${r.socEnd ?? '?'} %`,
              r.energyKWh != null ? `${num(r.energyKWh)} kWh` : '—',
              r.location,
            ])}
          />
          <div className="mt-2" />
          <T
            head={['Data/hora', 'Bateria', 'SOC', 'Tensão', 'Fonte da leitura']}
            empty="Nenhuma leitura manual no período."
            rows={rd.map((r) => [
              new Date(r.timestamp).toLocaleString('pt-BR'),
              r.batteryId === 'battery-a' ? 'A' : 'B',
              r.socPercent != null ? `${r.socPercent} %` : '—',
              r.voltageV != null ? `${num(r.voltageV)} V` : '—',
              r.source,
            ])}
          />
        </Section>

        <Section n={6} title="Sintomas e alertas">
          <T
            head={['Data', 'Componente', 'Descrição', 'Status']}
            empty="Nenhum sintoma registrado."
            rows={symptoms.items.map((s) => [dt(s.date), getComponent(s.componentId)?.name, s.description, s.status])}
          />
          <div className="mt-2" />
          <T
            head={['Início', 'Severidade', 'Alerta', 'Medição', 'Origem']}
            empty="Nenhum alerta nesta sessão."
            rows={alerts
              .slice(0, 30)
              .map((a) => [
                new Date(a.startedAt).toLocaleString('pt-BR'),
                a.severity,
                a.title,
                a.message,
                <Tag key="o" o={a.origin} />,
              ])}
          />
          <p className="mt-1 text-[10px] text-slate-600">
            Alertas SIMULADOS servem apenas para validar fluxos; limiares são ilustrativos e não são limites da Voltz
            EVS.
          </p>
        </Section>

        <Section n={7} title="Especificações pendentes de confirmação">
          <T
            head={['Componente', 'Afirmação', 'Valor', 'Status', 'Fonte']}
            empty="Todas as especificações confirmadas."
            rows={pendingSpecs.map(({ c, s }) => [
              c.name,
              s.label,
              s.value,
              s.evidence === 'hipotese' ? 'hipótese' : 'não verificado',
              s.source,
            ])}
          />
        </Section>

        <Section n={8} title="Cobertura por componente">
          <T
            head={['Componente', 'Cobertura']}
            empty="—"
            rows={covItems.map((c) => [c.name, COVERAGE_LABEL[c.coverage]])}
          />
        </Section>

        <footer className="mt-8 border-t border-slate-300 pt-2 text-[9px] text-slate-500">
          EletricMotor · relatório gerado automaticamente a partir dos registros do proprietário. Unidades SI; datas no
          fuso local, armazenamento em UTC. Não afiliado à Voltz.
        </footer>
      </article>
    </div>
  );
}
