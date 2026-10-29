import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { HARDWARE, useReading } from '../../app/telemetry';
import { CATALOG, getComponent } from '../../domain/catalog';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import type { SensorCandidate } from '../../domain/types';
import { Button, Card, PageHeader, Reading, cx } from '../../shared/ui';

const FEAS = { alta: 'text-emerald-300', media: 'text-amber-300', baixa: 'text-red-300' };
const STATUS_LABEL: Record<SensorCandidate['status'], string> = {
  proposto: 'sugerido',
  em_avaliacao: 'em avaliação',
  em_implantacao: 'em implantação',
  instalado: 'instalado',
};

const deploying = SENSOR_CANDIDATES.filter((s) => s.status === 'em_implantacao' || s.status === 'instalado');
const suggested = SENSOR_CANDIDATES.filter((s) => s.status === 'proposto' || s.status === 'em_avaliacao');

/** Leitura ao vivo do canal de temperatura do motor hub (t1) quando o gateway está conectado. */
function HubTemp() {
  const dv = useReading('hub-motor', 'temperature', '°C');
  return <Reading label="t1 · temperatura do motor hub" dv={dv} />;
}

/** Status do gateway: versão anunciada pelo firmware em qualquer adaptador físico. */
function GatewayStatus() {
  const fw = HARDWARE.map((a) => ({ a, st: a.status() })).find((x) => x.st.firmware);
  if (!fw)
    return (
      <p className="text-xs text-slate-400">
        Gateway não conectado agora.{' '}
        <Link to="/conectividade" className="text-cyanx-300 underline">
          Conectar
        </Link>
      </p>
    );
  return (
    <p className={cx('text-xs', fw.st.firmwareAdvice?.status === 'desatualizado' ? 'text-amber-300' : 'text-emerald-300')}>
      {fw.st.firmware!.name} v{fw.st.firmware!.version} via {fw.a.name} — {fw.st.firmwareAdvice?.message}{' '}
      <Link to="/firmware" className="text-cyanx-300 underline">
        Firmware
      </Link>
    </p>
  );
}

function SensorList({ items, sel, onSel }: { items: SensorCandidate[]; sel: string; onSel: (id: string) => void }) {
  return (
    <div className="space-y-1">
      {items.map((x) => (
        <button
          key={x.id}
          onClick={() => onSel(x.id)}
          className={cx(
            'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm',
            sel === x.id ? 'bg-orange-500/10 text-orange-200 ring-1 ring-orange-400/40' : 'text-slate-300 hover:bg-ink-800',
          )}
        >
          <span>
            {x.name}
            {x.channel && <span className="ml-1 font-mono text-[11px] text-cyanx-300">{x.channel}</span>}
          </span>
          <span className={cx('shrink-0 text-xs', FEAS[x.feasibility])}>viabilidade {x.feasibility}</span>
        </button>
      ))}
    </div>
  );
}

export default function SensorsPage() {
  const [sel, setSel] = useState(deploying[0]?.id ?? SENSOR_CANDIDATES[0].id);
  const s = SENSOR_CANDIDATES.find((x) => x.id === sel)!;
  const nav = useNavigate();
  const select = useApp((st) => st.select);
  const setViewMode = useApp((st) => st.setViewMode);
  const original = CATALOG.flatMap((c) =>
    c.signals.filter((x) => x.availability !== 'sensor_futuro').map((x) => ({ c, x })),
  );
  const installed = SENSOR_CANDIDATES.filter((x) => x.status === 'instalado').length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Sensores e instrumentação"
        subtitle="Três grupos: o que a moto já tem (a investigar), o que está em implantação com suporte no app e o que é sugerido."
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

      <div className="grid grid-cols-2 gap-2 text-center text-xs md:grid-cols-4">
        {(
          [
            ['Sistema original', original.length, 'sinais a investigar', 'text-cyanx-300'],
            ['Em implantação', deploying.length, 'com suporte no app', 'text-emerald-300'],
            ['Sugeridos', suggested.length, 'propostos / em avaliação', 'text-orange-300'],
            ['Instalados na moto', installed, 'montados e validados', 'text-slate-200'],
          ] as const
        ).map(([t, n, sub, tone]) => (
          <div key={t} className="panel p-2" data-testid={`sensor-count-${t}`}>
            <div className={cx('text-2xl font-semibold', tone)}>{n}</div>
            <div className="text-slate-200">{t}</div>
            <div className="text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyanx-400" />
              Já existentes — sistema original
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
            Sensores de fábrica (BMS no topo de cada bateria, controladora, painel). Não presumir CAN/UART/BLE/OBD sem
            documentação.
          </p>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Em implantação — suporte no app
            </span>
          }
        >
          <SensorList items={deploying} sel={sel} onSel={setSel} />
          <div className="mt-3 space-y-2 rounded border border-ink-700 p-2">
            <GatewayStatus />
            <HubTemp />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Hardware e firmware próprios (gateway ESP32). As leituras só entram como REAL depois de validar o dispositivo em
            Conectividade.
          </p>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-proposal" />
              Sugeridos
            </span>
          }
        >
          <SensorList items={suggested} sel={sel} onSel={setSel} />
        </Card>
      </div>

      <Card
        title={s.name}
        right={
          <span
            className={cx(
              'rounded px-2 py-0.5 text-xs',
              s.status === 'em_implantacao' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-orange-500/15 text-orange-300',
            )}
          >
            {STATUS_LABEL[s.status]}
          </span>
        }
      >
        {s.progress && (
          <p className="mb-3 rounded border border-emerald-400/30 bg-emerald-500/5 p-2 text-sm text-emerald-100">
            {s.progress}
          </p>
        )}
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ['Objetivo', s.objective],
              ['Grandeza', s.quantity],
              ['Posição planejada', s.location],
              ['Componente', getComponent(s.componentId)?.name],
              ['Tecnologia', s.technology],
              ['Interface', s.interface],
              ['Canal EMGP', s.channel],
              ['Firmware', s.firmware],
              ['Alimentação', s.power],
              ['Isolamento', s.isolation],
              ['Precisão', s.accuracy],
              ['Frequência', s.sampleRate],
              ['Riscos', s.risks],
              ['Validações pendentes', s.pendingValidation],
              ['Custo estimado (R$)', s.estimatedCostBRL],
            ] as [string, string | undefined][]
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
                <dd className="text-slate-200">{v}</dd>
              </div>
            ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => (select(s.componentId), setViewMode('sensores'), nav('/explorador'))}>Localizar no 3D</Button>
          {s.status === 'em_implantacao' && (
            <>
              <Button onClick={() => nav('/conectividade')}>Conectar / cadastrar</Button>
              <Button onClick={() => nav('/firmware')}>Firmware</Button>
            </>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Escolha final de hardware somente após validação da topologia física e dos requisitos de segurança. Custos são
          faixas de referência a confirmar com orçamento.
        </p>
      </Card>
    </div>
  );
}
