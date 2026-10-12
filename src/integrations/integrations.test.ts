import { describe, expect, it } from 'vitest';
import { parseSamplesCsv, samplesToCsv } from './csv';
import { GatewayAdapter } from './GatewayAdapter';
import { SCENARIOS, initialState, rng, step, type ScenarioId } from './simulator/engine';

const run = (scenario: ScenarioId, n = 40, batteryCount: 1 | 2 = 2) => {
  let st = initialState(0);
  const rand = rng(1);
  const all = [];
  const events = [];
  for (let i = 0; i < n; i++) {
    const r = step(st, scenario, { vehicleId: 'evs-1', batteryCount, dtMs: 500, rand });
    st = r.state;
    all.push(...r.samples);
    events.push(...r.events);
  }
  return { st, all, events };
};

describe('simulador', () => {
  it('cobre os 8 cenários mínimos da especificação', () => {
    expect(SCENARIOS).toHaveLength(8);
  });
  it('é determinístico com a mesma seed', () => {
    expect(run('urban').all.map((s) => s.value)).toEqual(run('urban').all.map((s) => s.value));
  });
  it('toda amostra é marcada como SIMULADO', () => {
    for (const id of SCENARIOS.map((s) => s.id)) expect(run(id).all.every((s) => s.origin === 'SIMULADO')).toBe(true);
  });
  it('carga aumenta SOC e percurso reduz', () => {
    expect(run('charging', 200).st.socA).toBeGreaterThan(initialState(0).socA);
    expect(run('climb', 200).st.socA).toBeLessThan(initialState(0).socA);
  });
  it('gateway desconectado não emite amostras', () => {
    expect(run('gateway-down').all).toHaveLength(0);
  });
  it('falha do BMS invalida dados da bateria B', () => {
    const b = run('bms-fault').all.filter((s) => s.componentId === 'battery-b');
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((s) => s.quality === 'invalida')).toBe(true);
  });
  it('com 1 bateria não emite dados da bateria B', () => {
    expect(run('urban', 10, 1).all.some((s) => s.componentId === 'battery-b')).toBe(false);
  });
  it('SOC permanece entre 0 e 100', () => {
    const { all } = run('climb', 400);
    for (const s of all.filter((x) => x.quantity === 'soc')) {
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(100);
    }
  });
});

describe('gateway', () => {
  it('não implementa protocolo e recusa conexão', async () => {
    const g = new GatewayAdapter();
    await g.connect();
    expect(g.status().state).toBe('nao_implementado');
  });
});

describe('CSV', () => {
  it('ida e volta; origem REAL importada manualmente é rebaixada', () => {
    const csv = samplesToCsv(run('urban', 2).all.map((s) => ({ ...s, origin: 'REAL' as const })));
    const { samples, errors } = parseSamplesCsv(csv);
    expect(errors).toHaveLength(0);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.origin !== 'REAL')).toBe(true);
  });
  it('reporta colunas ausentes', () => {
    expect(parseSamplesCsv('a,b\n1,2').errors.length).toBeGreaterThan(0);
  });
});
