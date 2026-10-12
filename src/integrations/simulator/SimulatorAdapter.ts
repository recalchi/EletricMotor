import { BaseAdapter } from '../adapter';
import { initialState, rng, step, type ScenarioId, type SimEvent, type SimState } from './engine';

/** Adaptador do simulador — mesma interface que um gateway real; origem SIMULADO. */
export class SimulatorAdapter extends BaseAdapter {
  id = 'simulator';
  name = 'Simulador de telemetria';
  kind = 'simulator' as const;
  description = 'Gera dados fictícios para demonstração. Nunca é misturado com histórico real.';

  scenario: ScenarioId = 'urban';
  speedFactor = 1;
  batteryCount: 1 | 2 = 2;
  private state: SimState = initialState();
  private timer: ReturnType<typeof setInterval> | null = null;
  private rand = rng(42);
  private eventHandlers = new Set<(e: SimEvent) => void>();

  constructor(private vehicleId: string) {
    super();
  }

  onEvent(h: (e: SimEvent) => void) {
    this.eventHandlers.add(h);
    return () => void this.eventHandlers.delete(h);
  }

  get playing() {
    return this.timer != null;
  }

  async connect() {
    if (this.timer) return;
    this.st.state = 'conectado';
    this.st.message = 'MODO SIMULAÇÃO ativo';
    this.log('info', `Simulador iniciado — cenário "${this.scenario}"`);
    const tickMs = 500;
    this.state.t = Date.now();
    this.timer = setInterval(() => {
      const res = step(this.state, this.scenario, {
        vehicleId: this.vehicleId,
        batteryCount: this.batteryCount,
        dtMs: tickMs * this.speedFactor,
        rand: this.rand,
      });
      // Mantém timestamps alinhados ao relógio real para cálculo de "desatualizado"
      res.state.t = Date.now();
      this.state = res.state;
      res.samples.forEach((s) => this.emit({ ...s, timestamp: res.state.t }));
      res.events.forEach((e) => {
        this.log(e.level, e.message);
        this.eventHandlers.forEach((h) => h({ ...e, at: res.state.t }));
      });
    }, tickMs);
  }

  async disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.st.state = 'desconectado';
    this.st.message = 'Simulador pausado';
    this.log('info', 'Simulador pausado');
  }

  setScenario(id: ScenarioId) {
    this.scenario = id;
    this.log('info', `Cenário alterado para "${id}"`);
  }

  reset() {
    this.state = initialState();
    this.rand = rng(42);
    this.st.samplesReceived = 0;
    this.log('info', 'Simulador reiniciado');
  }
}
