import { useState } from 'react';
import { useApp } from '../../app/store';
import { simulator, startSimulation, stopSimulation, useReading } from '../../app/telemetry';
import { SCENARIOS, type ScenarioId } from '../../integrations/simulator/engine';
import { Button, Card, OriginBadge, PageHeader, Reading, SimulationBanner, cx } from '../../shared/ui';
import { TimeSeriesChart } from '../../shared/ui/charts';
import { Icon } from '../../shared/ui/icons';

export default function LabPage() {
  const running = useApp((s) => s.simRunning);
  const events = useApp((s) => s.simEvents);
  const clearOrigin = useApp((s) => s.clearOrigin);
  const [scenario, setScenario] = useState<ScenarioId>(simulator.scenario);
  const [speed, setSpeed] = useState(simulator.speedFactor);

  const speedKmh = useReading('hub-motor', 'speed', 'km/h');
  const socA = useReading('battery-a', 'soc', '%');
  const socB = useReading('battery-b', 'soc', '%');
  const power = useReading('hub-motor', 'power', 'W');
  const tA = useReading('battery-a', 'temperature', '°C');
  const tB = useReading('battery-b', 'temperature', '°C');
  const tM = useReading('hub-motor', 'temperature', '°C');
  const tC = useReading('motor-controller', 'temperature', '°C');

  return (
    <div className="space-y-3">
      {running && <SimulationBanner />}
      <PageHeader
        title="Laboratório — Simulador"
        subtitle="Valida telas, alertas e fluxos sem hardware. Dados FICTÍCIOS: não representam limites seguros da Voltz EVS."
        right={
          <div className="flex gap-2">
            {running ? (
              <Button onClick={stopSimulation} data-testid="sim-pause">
                <Icon name="pause" /> Pausar
              </Button>
            ) : (
              <Button variant="primary" onClick={startSimulation} data-testid="sim-play">
                <Icon name="play" /> Iniciar simulação
              </Button>
            )}
            <Button
              onClick={() => {
                simulator.reset();
                clearOrigin('SIMULADO');
              }}
            >
              <Icon name="reset" /> Reset
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Card title="Cenários">
          <div className="space-y-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  simulator.setScenario(s.id);
                  setScenario(s.id);
                }}
                className={cx(
                  'w-full rounded-md px-3 py-2 text-left text-sm ring-1 transition',
                  scenario === s.id
                    ? 'bg-amber-500/10 text-amber-200 ring-amber-400/50'
                    : 'text-slate-300 ring-ink-700 hover:bg-ink-800',
                )}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-slate-500">{s.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wider text-slate-400">Velocidade do tempo: {speed}×</label>
            <input
              type="range"
              min={1}
              max={20}
              value={speed}
              onChange={(e) => {
                simulator.speedFactor = Number(e.target.value);
                setSpeed(Number(e.target.value));
              }}
              className="w-full accent-amber-400"
            />
          </div>
        </Card>

        <div className="space-y-3">
          <Card title="Leituras simuladas" right={<OriginBadge origin="SIMULADO" />}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Reading label="Velocidade" dv={speedKmh} big digits={0} />
              <Reading label="Potência" dv={power} big digits={0} />
              <Reading label="SOC A" dv={socA} big />
              <Reading label="SOC B" dv={socB} big />
              <Reading label="Temp. bateria A" dv={tA} />
              <Reading label="Temp. bateria B" dv={tB} />
              <Reading label="Temp. motor" dv={tM} />
              <Reading label="Temp. controladora" dv={tC} />
            </div>
          </Card>
          <Card title="Séries">
            <TimeSeriesChart
              series={[
                { componentId: 'hub-motor', quantity: 'speed', label: 'Velocidade', color: '#22d3ee', unit: 'km/h' },
                { componentId: 'battery-a', quantity: 'temperature', label: 'Temp. A', color: '#f472b6', unit: '°C' },
                {
                  componentId: 'hub-motor',
                  quantity: 'temperature',
                  label: 'Temp. motor',
                  color: '#fb923c',
                  unit: '°C',
                },
                { componentId: 'battery-b', quantity: 'temperature', label: 'Temp. B', color: '#a78bfa', unit: '°C' },
              ]}
            />
          </Card>
          <Card title="Eventos do simulador">
            {events.length ? (
              <ul className="max-h-56 space-y-1 overflow-auto font-mono text-xs">
                {events.map((e, i) => (
                  <li
                    key={i}
                    className={
                      e.level === 'error' ? 'text-red-300' : e.level === 'warn' ? 'text-amber-300' : 'text-slate-400'
                    }
                  >
                    {new Date(e.at).toLocaleTimeString('pt-BR')} — {e.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Sem eventos. Teste os cenários de falha/perda de dados.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
