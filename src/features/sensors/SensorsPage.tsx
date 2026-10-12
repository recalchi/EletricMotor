import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { CATALOG, getComponent } from '../../domain/catalog';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import { Button, Card, PageHeader, cx } from '../../shared/ui';

const FEAS = { alta: 'text-emerald-300', media: 'text-amber-300', baixa: 'text-red-300' };

export default function SensorsPage() {
  const [sel, setSel] = useState(SENSOR_CANDIDATES[0].id);
  const s = SENSOR_CANDIDATES.find((x) => x.id === sel)!;
  const nav = useNavigate();
  const select = useApp((st) => st.select);
  const setViewMode = useApp((st) => st.setViewMode);
  const original = CATALOG.flatMap((c) =>
    c.signals.filter((x) => x.availability !== 'sensor_futuro').map((x) => ({ c, x })),
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Sensores e instrumentação"
        subtitle="Separação rigorosa: leituras do sistema original (a investigar) × sensores adicionais propostos. Nada está instalado."
        right={
          <Button
            onClick={() => {
              setViewMode('sensores');
              nav('/explorador');
            }}
          >
            Ver mapa 3D de sensores
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyanx-400" />
              Sistema original — sinais a investigar
            </span>
          }
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Grandeza</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {original.map(({ c, x }) => (
                <tr key={c.id + x.quantity}>
                  <td>{c.name}</td>
                  <td>
                    {x.quantity} ({x.unit})
                  </td>
                  <td className="text-xs text-slate-400">
                    {x.availability === 'validado' ? 'validado' : 'interface não validada'}
                    {x.note && <div className="text-slate-500">{x.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            Instalados e validados: 0. Não presumir CAN/UART/BLE/OBD sem documentação.
          </p>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-proposal" />
              Sensores adicionais propostos
            </span>
          }
        >
          <div className="space-y-1">
            {SENSOR_CANDIDATES.map((x) => (
              <button
                key={x.id}
                onClick={() => setSel(x.id)}
                className={cx(
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm',
                  sel === x.id
                    ? 'bg-orange-500/10 text-orange-200 ring-1 ring-orange-400/40'
                    : 'text-slate-300 hover:bg-ink-800',
                )}
              >
                <span>{x.name}</span>
                <span className={cx('text-xs', FEAS[x.feasibility])}>viabilidade {x.feasibility}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title={s.name}
        right={
          <span className="rounded bg-orange-500/15 px-2 py-0.5 text-xs text-orange-300">
            {s.status.replace('_', ' ')}
          </span>
        }
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ['Objetivo', s.objective],
              ['Grandeza', s.quantity],
              ['Posição planejada', s.location],
              ['Componente', getComponent(s.componentId)?.name],
              ['Tecnologia candidata', s.technology],
              ['Interface', s.interface],
              ['Alimentação', s.power],
              ['Isolamento', s.isolation],
              ['Precisão', s.accuracy],
              ['Frequência', s.sampleRate],
              ['Riscos', s.risks],
              ['Validações pendentes', s.pendingValidation],
              ['Custo estimado (R$)', s.estimatedCostBRL],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => (select(s.componentId), setViewMode('sensores'), nav('/explorador'))}>
            Localizar no 3D
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Escolha final de hardware somente após validação da topologia física e dos requisitos de segurança. Custos são
          faixas de referência a confirmar com orçamento.
        </p>
      </Card>
    </div>
  );
}
