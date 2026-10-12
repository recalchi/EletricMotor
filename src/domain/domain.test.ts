import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, acknowledge, evaluate, maintenanceDue } from './alerts';
import { CATALOG, CATALOG_BY_ID, buildTree, descendants } from './catalog';
import { coverageSummary, effectiveCoverage } from './coverage';
import { availableEnergyKWh, consumptionWhKm, nominalEnergyKWh, rangeKm } from './estimates';
import { filterByOrigin, fromSample, isStale } from './origin';
import { SENSOR_CANDIDATES } from './sensors';
import type { TelemetrySample } from './types';

const sample = (p: Partial<TelemetrySample>): TelemetrySample => ({
  vehicleId: 'evs-1',
  componentId: 'battery-a',
  sensorId: 's',
  quantity: 'temperature',
  value: 30,
  unit: '°C',
  timestamp: 1_000,
  origin: 'SIMULADO',
  quality: 'boa',
  validForMs: 5_000,
  parserVersion: 't',
  deviceId: 'd',
  ...p,
});

describe('catálogo', () => {
  it('tem ids únicos', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('todo parentId aponta para um componente existente', () => {
    for (const c of CATALOG) if (c.parentId) expect(CATALOG_BY_ID[c.parentId], c.id).toBeDefined();
  });
  it('motor é hub na roda traseira (sem transmissão por corrente)', () => {
    expect(CATALOG_BY_ID['hub-motor'].parentId).toBe('wheel-rear');
    expect(CATALOG.some((c) => /corrente|correia/i.test(c.name))).toBe(false);
  });
  it('nenhuma especificação está marcada como confirmada sem fonte documental', () => {
    for (const c of CATALOG)
      for (const s of c.specs)
        if (s.evidence === 'documento' || s.evidence === 'inspecao') expect(s.source).not.toMatch(/Prancha|Sem fonte/);
  });
  it('árvore cobre todos os componentes', () => {
    const tree = buildTree();
    const seen = new Set<string>();
    const walk = (id: string, ch: (id: string) => { id: string }[]) => {
      seen.add(id);
      ch(id).forEach((k) => walk(k.id, ch));
    };
    tree.forEach((g) => g.roots.forEach((r) => walk(r.id, g.children)));
    expect(seen.size).toBe(CATALOG.length);
  });
  it('descendants inclui filhos de outros grupos', () => {
    expect(descendants('wheel-rear')).toContain('hub-motor');
  });
});

describe('cobertura', () => {
  it('não alega medição direta sem interface validada', () => {
    expect(coverageSummary().counts.medido).toBe(0);
    expect(coverageSummary().measuredPercent).toBe(0);
  });
  it('só vira "medido" com dado REAL', () => {
    const c = CATALOG_BY_ID['battery-a'];
    expect(effectiveCoverage(c, new Set())).toBe('estimado');
    expect(effectiveCoverage(c, new Set(['battery-a']))).toBe('medido');
  });
  it('nenhum sinal está como validado', () => {
    expect(CATALOG.flatMap((c) => c.signals).some((s) => s.availability === 'validado')).toBe(false);
  });
  it('sensores propostos não aparecem como instalados', () => {
    expect(SENSOR_CANDIDATES.every((s) => s.status !== 'instalado')).toBe(true);
  });
});

describe('origem', () => {
  it('sem amostra → INDISPONÍVEL e valor null (nunca inventa número)', () => {
    const dv = fromSample(undefined, '%');
    expect(dv.origin).toBe('INDISPONIVEL');
    expect(dv.value).toBeNull();
  });
  it('amostra inválida → INDISPONÍVEL', () => {
    expect(fromSample(sample({ quality: 'invalida' }), '°C').value).toBeNull();
  });
  it('marca dados antigos como desatualizados', () => {
    expect(isStale(sample({ timestamp: 0 }), 10_000)).toBe(true);
    expect(isStale(sample({ timestamp: 9_000 }), 10_000)).toBe(false);
  });
  it('filtra por origem sem misturar', () => {
    const r = filterByOrigin([sample({}), sample({ origin: 'REAL' })], 'REAL');
    expect(r).toHaveLength(1);
  });
});

describe('estimativas', () => {
  it('energia nominal 72 V × 33,6 Ah ≈ 2,42 kWh', () => {
    expect(nominalEnergyKWh(72, 33.6).value).toBe(2.42);
  });
  it('entrada desconhecida → null', () => {
    expect(nominalEnergyKWh(null, 33.6).value).toBeNull();
    expect(rangeKm(3, null).value).toBeNull();
  });
  it('energia disponível soma pacotes válidos', () => {
    expect(
      availableEnergyKWh([
        { nominalKWh: 2, socPercent: 50 },
        { nominalKWh: 2, socPercent: 100 },
      ]).value,
    ).toBe(3);
  });
  it('autonomia e consumo', () => {
    expect(rangeKm(3, 60).value).toBe(50);
    expect(consumptionWhKm(1.2, 20)).toBe(60);
    expect(consumptionWhKm(1, 0)).toBeNull();
  });
});

describe('alertas', () => {
  it('abre e encerra alerta por regra', () => {
    let a = evaluate(sample({ value: 60, timestamp: 1 }), DEFAULT_RULES, []);
    expect(a).toHaveLength(1);
    expect(a[0].origin).toBe('SIMULADO');
    a = evaluate(sample({ value: 61, timestamp: 2 }), DEFAULT_RULES, a);
    expect(a).toHaveLength(1);
    a = evaluate(sample({ value: 30, timestamp: 3 }), DEFAULT_RULES, a);
    expect(a[0].endedAt).toBe(3);
  });
  it('ignora amostras inválidas', () => {
    expect(evaluate(sample({ value: 99, quality: 'invalida' }), DEFAULT_RULES, [])).toHaveLength(0);
  });
  it('confirma alerta', () => {
    const a = evaluate(sample({ value: 60 }), DEFAULT_RULES, []);
    expect(acknowledge(a, a[0].id, 5)[0].acknowledgedAt).toBe(5);
  });
  it('lembrete de manutenção por km e por data', () => {
    expect(
      maintenanceDue(
        { everyKm: 3000 },
        { date: '2026-01-01', odometerKm: 1000 },
        { date: new Date('2026-02-01'), odometerKm: 4500 },
      ).due,
    ).toBe(true);
    expect(
      maintenanceDue(
        { everyDays: 30 },
        { date: '2026-01-01', odometerKm: 0 },
        { date: new Date('2026-01-10'), odometerKm: 0 },
      ).due,
    ).toBe(false);
    expect(maintenanceDue({ everyDays: 30 }, undefined, { date: new Date(), odometerKm: 0 }).due).toBe(true);
  });
});
