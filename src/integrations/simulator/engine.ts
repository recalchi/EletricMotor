import type { Quantity, TelemetrySample } from '../../domain/types';

/**
 * Motor do simulador — puro e determinístico (seed). Todos os valores são FICTÍCIOS de demonstração
 * e não representam limites ou comportamento real da Voltz EVS.
 */

export type ScenarioId =
  | 'parked'
  | 'charging'
  | 'urban'
  | 'climb'
  | 'low-battery'
  | 'high-temp'
  | 'bms-fault'
  | 'gateway-down';

export interface Scenario {
  id: ScenarioId;
  name: string;
  description: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'parked', name: 'Desligada / estacionada', description: 'Sem corrente; temperaturas tendem ao ambiente.' },
  { id: 'charging', name: 'Carga em andamento', description: 'SOC subindo, corrente de carga, leve aquecimento.' },
  { id: 'urban', name: 'Percurso urbano econômico', description: 'Velocidade 15–50 km/h com paradas.' },
  { id: 'climb', name: 'Aceleração e subida', description: 'Alta demanda de corrente e aquecimento.' },
  {
    id: 'low-battery',
    name: 'Baixa carga e perda de dados',
    description: 'SOC baixo e amostras intermitentes/inválidas.',
  },
  { id: 'high-temp', name: 'Temperatura elevada (hipotética)', description: 'Baterias aquecendo acima do normal.' },
  { id: 'bms-fault', name: 'Falha hipotética do BMS', description: 'Bateria B para de reportar dados válidos.' },
  {
    id: 'gateway-down',
    name: 'Gateway desconectado',
    description: 'Nenhuma amostra nova; leituras ficam desatualizadas.',
  },
];

export interface SimState {
  t: number; // ms epoch (simulado)
  socA: number;
  socB: number;
  tempA: number;
  tempB: number;
  motorTemp: number;
  ctrlTemp: number;
  speed: number;
  odometerKm: number;
  phase: number;
}

export interface SimEvent {
  at: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export const AMBIENT_C = 25;

export function initialState(now = Date.now(), soc = 78): SimState {
  return {
    t: now,
    socA: soc,
    socB: soc + 4,
    tempA: 27,
    tempB: 27,
    motorTemp: 30,
    ctrlTemp: 30,
    speed: 0,
    odometerKm: 1248,
    phase: 0,
  };
}

/** PRNG mulberry32 — determinístico para testes. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const approach = (v: number, target: number, rate: number) => v + (target - v) * rate;

export interface StepResult {
  state: SimState;
  samples: TelemetrySample[];
  events: SimEvent[];
}

export interface StepOptions {
  vehicleId: string;
  batteryCount: 1 | 2;
  dtMs: number;
  rand: () => number;
}

/** Tensão fictícia de pack ~72 V nominal (modelo linear de demonstração). */
const packVoltage = (soc: number, current: number) => 64 + (soc / 100) * 20 - current * 0.04;

export function step(prev: SimState, scenario: ScenarioId, o: StepOptions): StepResult {
  const s: SimState = { ...prev, t: prev.t + o.dtMs, phase: prev.phase + o.dtMs / 1000 };
  const dt = o.dtMs / 1000;
  const r = () => o.rand() - 0.5;
  const events: SimEvent[] = [];

  // Demanda de velocidade e corrente por cenário
  let targetSpeed = 0;
  let current = 0; // A por bateria; negativo = carga
  let heatBat = 0;
  switch (scenario) {
    case 'urban':
      targetSpeed = clamp(32 + 18 * Math.sin(s.phase / 6) + r() * 6, 0, 55);
      if (Math.sin(s.phase / 6) < -0.8) targetSpeed = 0;
      break;
    case 'climb':
      targetSpeed = clamp(55 + 12 * Math.sin(s.phase / 4) + r() * 4, 30, 75);
      break;
    case 'low-battery':
      targetSpeed = clamp(25 + 10 * Math.sin(s.phase / 5), 0, 40);
      break;
    case 'high-temp':
      targetSpeed = clamp(45 + r() * 6, 30, 60);
      heatBat = 0.25;
      break;
    case 'bms-fault':
      targetSpeed = clamp(30 + r() * 5, 0, 45);
      break;
    default:
      targetSpeed = 0;
  }
  s.speed = clamp(approach(prev.speed, targetSpeed, 0.35), 0, 120);

  if (scenario === 'charging') current = -(12 + r());
  else if (s.speed > 0.5) {
    const accel = (s.speed - prev.speed) / dt;
    const demand = 4 + s.speed * 0.35 + Math.max(0, accel) * 6 + (scenario === 'climb' ? 35 : 0);
    current = clamp(demand + r() * 3, 0, 140) / o.batteryCount;
  }

  // SOC (capacidade fictícia 33,6 Ah por bateria)
  const dSoc = ((current * dt) / 3600 / 33.6) * 100 * (scenario === 'charging' ? 1 : 1);
  s.socA = clamp(prev.socA - dSoc, 0, 100);
  s.socB = o.batteryCount === 2 ? clamp(prev.socB - dSoc * 1.03, 0, 100) : prev.socB;
  if (scenario === 'low-battery') {
    s.socA = Math.min(s.socA, 12 - (s.phase % 30) * 0.02);
    s.socB = Math.min(s.socB, 10 - (s.phase % 30) * 0.02);
  }

  // Térmico simplificado
  const loadHeat = Math.abs(current) * 0.012;
  s.tempA = approach(prev.tempA, AMBIENT_C + loadHeat * 30 + heatBat * 120, 0.03);
  s.tempB = approach(prev.tempB, AMBIENT_C + loadHeat * 30 + heatBat * 130, 0.03);
  s.motorTemp = approach(prev.motorTemp, AMBIENT_C + Math.abs(current) * 0.9, 0.02);
  s.ctrlTemp = approach(prev.ctrlTemp, AMBIENT_C + Math.abs(current) * 0.6, 0.03);
  s.odometerKm = prev.odometerKm + (s.speed * dt) / 3600;

  // Emissão
  if (scenario === 'gateway-down') {
    if (Math.floor(prev.phase / 10) !== Math.floor(s.phase / 10))
      events.push({ at: s.t, level: 'warn', message: 'Gateway sem resposta — nenhuma amostra recebida' });
    return { state: s, samples: [], events };
  }

  const mk = (
    componentId: string,
    sensorId: string,
    quantity: Quantity,
    value: number,
    unit: string,
    quality: TelemetrySample['quality'] = 'boa',
  ): TelemetrySample => ({
    vehicleId: o.vehicleId,
    componentId,
    sensorId,
    quantity,
    value: Math.round(value * 100) / 100,
    unit,
    timestamp: s.t,
    origin: 'SIMULADO',
    quality,
    validForMs: 5000,
    parserVersion: 'sim-1.0.0',
    deviceId: 'simulator',
  });

  const lossy = scenario === 'low-battery' && o.rand() < 0.35;
  const q = (): TelemetrySample['quality'] => (lossy ? (o.rand() < 0.5 ? 'invalida' : 'suspeita') : 'boa');

  const samples: TelemetrySample[] = [
    mk('battery-a', 'sim-bms-a', 'soc', s.socA, '%', q()),
    mk('battery-a', 'sim-bms-a', 'voltage', packVoltage(s.socA, current), 'V', q()),
    mk('battery-a', 'sim-bms-a', 'current', current, 'A', q()),
    mk('battery-a', 'sim-bms-a', 'temperature', s.tempA + r() * 0.3, '°C', q()),
    mk('hub-motor', 'sim-motor', 'speed', s.speed, 'km/h'),
    mk('hub-motor', 'sim-motor', 'rpm', s.speed * 9.6, 'rpm'),
    mk('hub-motor', 'sim-motor', 'temperature', s.motorTemp, '°C'),
    mk('hub-motor', 'sim-motor', 'power', Math.max(0, current) * o.batteryCount * packVoltage(s.socA, current), 'W'),
    mk('motor-controller', 'sim-ctrl', 'temperature', s.ctrlTemp, '°C'),
    mk('motor-controller', 'sim-ctrl', 'current', current * o.batteryCount, 'A'),
    mk('tft-dashboard', 'sim-tft', 'odometer', s.odometerKm, 'km'),
  ];

  if (o.batteryCount === 2) {
    const bQuality: TelemetrySample['quality'] = scenario === 'bms-fault' ? 'invalida' : q();
    samples.push(
      mk('battery-b', 'sim-bms-b', 'soc', s.socB, '%', bQuality),
      mk('battery-b', 'sim-bms-b', 'voltage', packVoltage(s.socB, current), 'V', bQuality),
      mk('battery-b', 'sim-bms-b', 'current', current, 'A', bQuality),
      mk('battery-b', 'sim-bms-b', 'temperature', s.tempB + r() * 0.3, '°C', bQuality),
    );
    if (scenario === 'bms-fault' && Math.floor(prev.phase / 8) !== Math.floor(s.phase / 8))
      events.push({ at: s.t, level: 'error', message: 'BMS B (simulado): comunicação perdida / dados inválidos' });
  }
  if (lossy) events.push({ at: s.t, level: 'warn', message: 'Amostras com qualidade degradada (simulado)' });

  return { state: s, samples, events };
}
