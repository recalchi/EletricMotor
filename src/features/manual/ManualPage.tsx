import { useState } from 'react';
import { CATALOG, GROUP_LABELS } from '../../domain/catalog';
import { COVERAGE_LABEL } from '../../domain/coverage';
import { useEffectiveCoverage } from '../../app/telemetry';
import { Card, EvidenceBadge, PageHeader, cx } from '../../shared/ui';

const STEPS: { title: string; body: string[]; safety?: string; done?: string }[] = [
  {
    title: 'Identificar a EVS real',
    body: [
      'Registre ano, variante, chassi e quantidade de baterias (Configurações).',
      'Fotografe etiquetas das baterias, carregador, painel e placas visíveis — sem desmontar.',
      'Reúna manual do proprietário, nota fiscal e documentos de revisão.',
    ],
    done: 'Perfil do veículo preenchido e etiquetas das baterias conferidas (Baterias → Editar cadastro).',
  },
  {
    title: 'Mapear interfaces comprovadas',
    body: [
      'Compare documentação e inspeção visual autorizada; registre o que se sabe e o que NÃO se sabe.',
      'Atualize a matriz de evidências abaixo (documento / inspeção / hipótese / não verificado).',
      'Não presuma OBD-II, CAN, UART, BLE, Wi-Fi ou API do fabricante sem documento.',
    ],
    safety: 'Não abra baterias, não desconecte chicotes sob tensão e não sonde conectores desconhecidos.',
  },
  {
    title: 'Definir a aquisição de dados',
    body: [
      'Prefira caminhos externos e não invasivos: medidor de energia na tomada, TPMS de válvula, sensores com bateria própria.',
      'Leitura do BMS/controladora só com interface documentada, isolamento galvânico e avaliação profissional.',
      'Registre requisitos de isolamento, alimentação e segurança (Sensores).',
    ],
  },
  {
    title: 'Validar em bancada / com profissional',
    body: [
      'Teste equipamentos fora da moto primeiro.',
      'Envolva assistência autorizada para qualquer ponto de alta tensão.',
    ],
    safety: 'Tensões de tração (~72 V nominal, a confirmar) e altas correntes podem causar choque, arco e incêndio.',
  },
  {
    title: 'Configurar o adaptador / gateway',
    body: [
      'Implemente um TelemetryAdapter (src/integrations/adapter.ts) com id, versão e grandezas com unidade.',
      'Autentique o dispositivo no serviço de ingestão (Cloud Function — próxima fase). Nunca use credenciais administrativas no cliente.',
    ],
  },
  {
    title: 'Testar somente leitura',
    body: [
      'Verifique amostras, coerência física, latência e comportamento em falhas.',
      'O contrato não possui métodos de escrita/comando: a aplicação não controla a moto.',
    ],
  },
  {
    title: 'Mapear telemetria a componentes',
    body: [
      'Vincule cada sinal a componentId + quantity + unidade do catálogo.',
      'Calibre quando aplicável e registre a metodologia.',
    ],
  },
  {
    title: 'Conferir histórico e alertas',
    body: [
      'Valide relógio (UTC), perdas de conexão, dados desatualizados e valores inválidos.',
      'Revise limiares das regras com base em documentação do fabricante — os atuais são ilustrativos.',
    ],
  },
  {
    title: 'Habilitar acompanhamento habitual',
    body: [
      'Use dashboard, tendências, inspeções e exportações — sempre com origem do dado visível.',
      'Sem hardware: registre cargas, leituras do painel, inspeções e use o simulador para treinar.',
    ],
  },
];

export default function ManualPage() {
  const [tab, setTab] = useState<'manual' | 'evidencias' | 'cobertura'>('manual');
  const { summary: cov, items: covItems } = useEffectiveCoverage();
  const specs = CATALOG.flatMap((c) => c.specs.map((s) => ({ c, s })));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Manual Técnico"
        subtitle="Integração progressiva do modo demonstração à leitura real — com segurança em primeiro lugar."
      />
      <div className="flex gap-1">
        {(
          [
            ['manual', 'Manual de integração'],
            ['evidencias', 'Matriz de evidências'],
            ['cobertura', 'Matriz de cobertura'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm ring-1',
              tab === k
                ? 'bg-cyanx-500/15 text-cyanx-300 ring-cyanx-400/50'
                : 'text-slate-300 ring-ink-700 hover:bg-ink-800',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'manual' && (
        <div className="space-y-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
            <b>Proibições:</b> escrita em BMS/controladora, bypass de proteções, abertura de bateria ou manipulação de
            células de lítio, intervenções em freios ou itens de segurança sem procedimento aprovado.
          </div>
          {STEPS.map((s, i) => (
            <Card key={s.title} title={`${i + 1}. ${s.title}`}>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                {s.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {s.safety && <p className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-200">⚠ {s.safety}</p>}
              {s.done && <p className="mt-2 text-xs text-emerald-300">Estado esperado: {s.done}</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === 'evidencias' && (
        <Card title="Matriz de evidências (especificações)">
          <p className="mb-2 text-xs text-slate-400">
            Fonte atual: especificação do proprietário e pranchas conceituais (imagens geradas). Conflitos identificados
            entre pranchas: capacidade da bateria (33,6 Ah × 50 Ah), número de discos dianteiros (1 × 2), ABS × CBS,
            altura total (1.070 / 1.090 / 1.100 mm), tipo de balança.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Afirmação</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {specs.map(({ c, s }) => (
                <tr key={c.id + s.label}>
                  <td>{c.name}</td>
                  <td>{s.label}</td>
                  <td>
                    {s.value}
                    {s.note && <div className="text-[11px] text-slate-500">{s.note}</div>}
                  </td>
                  <td>
                    <EvidenceBadge status={s.evidence} />
                  </td>
                  <td className="text-xs text-slate-400">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'cobertura' && (
        <Card title="Matriz de cobertura de monitoramento">
          <div className="mb-3 grid grid-cols-2 gap-2 text-center md:grid-cols-5">
            <div className="rounded border border-ink-700 p-2">
              <div className="text-2xl font-mono">{cov.total}</div>
              <div className="text-xs text-slate-400">Cadastrados</div>
            </div>
            {(Object.keys(COVERAGE_LABEL) as (keyof typeof COVERAGE_LABEL)[]).map((k) => (
              <div key={k} className="rounded border border-ink-700 p-2">
                <div className="text-2xl font-mono">{cov.counts[k]}</div>
                <div className="text-xs text-slate-400">{COVERAGE_LABEL[k]}</div>
              </div>
            ))}
          </div>
          <p className="mb-2 text-xs text-amber-300">
            Componente cadastrado ≠ componente monitorado. Medição direta: {cov.measuredPercent}%.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Grupo</th>
                <th>Cobertura</th>
                <th>Sinais (disponibilidade)</th>
              </tr>
            </thead>
            <tbody>
              {covItems.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="text-xs text-slate-400">{GROUP_LABELS[c.group]}</td>
                  <td>{COVERAGE_LABEL[c.coverage]}</td>
                  <td className="text-xs text-slate-400">
                    {c.signals.length
                      ? c.signals.map((s) => `${s.quantity} (${s.availability.replace('_', ' ')})`).join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
