import { useReading } from '../../app/telemetry';
import { CATALOG_BY_ID } from '../../domain/catalog';
import { Card, EvidenceBadge, PageHeader, Reading } from '../../shared/ui';
import { TimeSeriesChart } from '../../shared/ui/charts';

export default function MotorPage() {
  const speed = useReading('hub-motor', 'speed', 'km/h');
  const rpm = useReading('hub-motor', 'rpm', 'rpm');
  const power = useReading('hub-motor', 'power', 'W');
  const tM = useReading('hub-motor', 'temperature', '°C');
  const iC = useReading('motor-controller', 'current', 'A');
  const tC = useReading('motor-controller', 'temperature', '°C');
  const motor = CATALOG_BY_ID['hub-motor'];
  const ctrl = CATALOG_BY_ID['motor-controller'];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Motor hub traseiro e controladora"
        subtitle="Tração direta na roda traseira (sem corrente/correia). Grandezas exibidas apenas quando houver fonte — hoje somente SIMULADO ou INDISPONÍVEL."
      />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Velocidade', speed, 0],
          ['Rotação', rpm, 0],
          ['Potência', power, 0],
          ['Temp. motor', tM, 1],
          ['Corrente controladora', iC, 1],
          ['Temp. controladora', tC, 1],
        ].map(([l, dv, d]) => (
          <div key={l as string} className="panel p-3">
            <Reading label={l as string} dv={dv as typeof speed} digits={d as number} big />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Velocidade e potência">
          <TimeSeriesChart
            series={[
              { componentId: 'hub-motor', quantity: 'speed', label: 'Velocidade', color: '#22d3ee', unit: 'km/h' },
              { componentId: 'hub-motor', quantity: 'power', label: 'Potência', color: '#fb923c', unit: 'W' },
            ]}
          />
        </Card>
        <Card title="Temperaturas">
          <TimeSeriesChart
            series={[
              { componentId: 'hub-motor', quantity: 'temperature', label: 'Motor', color: '#f87171', unit: '°C' },
              {
                componentId: 'motor-controller',
                quantity: 'temperature',
                label: 'Controladora',
                color: '#a78bfa',
                unit: '°C',
              },
            ]}
          />
        </Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[motor, ctrl].map((c) => (
          <Card key={c.id} title={c.name}>
            <p className="mb-2 text-sm text-slate-400">{c.description}</p>
            <table className="tbl">
              <tbody>
                {c.specs.map((s) => (
                  <tr key={s.label}>
                    <td className="text-slate-400">{s.label}</td>
                    <td>
                      {s.value}
                      {s.note && <div className="text-[11px] text-slate-500">{s.note}</div>}
                    </td>
                    <td className="text-right">
                      <EvidenceBadge status={s.evidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Códigos de erro (DTC): <b>não disponíveis</b> — nenhum protocolo de diagnóstico validado. Não inventar
              códigos.
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
