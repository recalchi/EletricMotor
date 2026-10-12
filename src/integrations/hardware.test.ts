import { describe, expect, it } from 'vitest';
import type { DeviceProfile, TelemetrySample } from '../domain/types';
import { BleEssAdapter } from './hardware/BleAdapters';
import { ManualEmgpAdapter, type TestConsoleEntry } from './hardware/DeviceStreamAdapter';
import { mapMessage } from './mapping';
import { LineBuffer, isPlausible, parseEmgpLine, seqGap, validateEmgp } from './protocol';

const NOW = 1_791_820_000_000;

const device = (p: Partial<DeviceProfile> = {}): DeviceProfile => ({
  id: 'esp32-hub',
  name: 'Hub',
  transport: 'serial',
  channels: [{ channel: 't1', componentId: 'hub-motor', quantity: 'temperature', unit: '°C', scale: 1, offset: 0 }],
  status: 'teste',
  createdAt: 0,
  sampleValidityMs: 30_000,
  ...p,
});

describe('EMGP — parsing e validação', () => {
  it('aceita mensagem válida', () => {
    const r = parseEmgpLine('{"v":1,"dev":"esp32-hub","seq":3,"ch":{"t1":31.5}}', NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg.ch.t1).toBe(31.5);
  });
  it.each([
    ['nada', ''],
    ['JSON quebrado', '{"v":1'],
    ['versão', '{"v":2,"dev":"abc","seq":1,"ch":{"a":1}}'],
    ['dev curto', '{"v":1,"dev":"a","seq":1,"ch":{"a":1}}'],
    ['seq negativo', '{"v":1,"dev":"abc","seq":-1,"ch":{"a":1}}'],
    ['sem canais', '{"v":1,"dev":"abc","seq":1,"ch":{}}'],
    ['valor texto', '{"v":1,"dev":"abc","seq":1,"ch":{"a":"1"}}'],
    ['canal inválido', '{"v":1,"dev":"abc","seq":1,"ch":{"a b":1}}'],
  ])('rejeita %s', (_, line) => {
    expect(parseEmgpLine(line, NOW).ok).toBe(false);
  });
  it('rejeita timestamps muito no futuro ou antigos demais', () => {
    expect(validateEmgp({ v: 1, dev: 'abc', seq: 1, ts: NOW + 10 * 60_000, ch: { a: 1 } }, NOW).ok).toBe(false);
    expect(validateEmgp({ v: 1, dev: 'abc', seq: 1, ts: NOW - 8 * 24 * 3600_000, ch: { a: 1 } }, NOW).ok).toBe(false);
    expect(validateEmgp({ v: 1, dev: 'abc', seq: 1, ts: NOW - 60_000, ch: { a: 1 } }, NOW).ok).toBe(true);
  });
  it('remonta linhas fragmentadas (serial/BLE)', () => {
    const b = new LineBuffer();
    expect(b.push('{"v":1,"de')).toEqual([]);
    expect(b.push('v":"abc"}\n{"x"')).toEqual(['{"v":1,"dev":"abc"}']);
    expect(b.push(':1}\r\n')).toEqual(['{"x":1}']);
  });
  it('detecta perdas, duplicatas e reinício', () => {
    expect(seqGap(5, 9)).toEqual({ lost: 3, duplicate: false, reset: false });
    expect(seqGap(5, 5).duplicate).toBe(true);
    expect(seqGap(5, 0).reset).toBe(true);
    expect(seqGap(null, 0).lost).toBe(0);
  });
  it('faixa de plausibilidade física', () => {
    expect(isPlausible('temperature', 80)).toBe(true);
    expect(isPlausible('temperature', 900)).toBe(false);
    expect(isPlausible('desconhecida', 1e9)).toBe(true);
  });
});

describe('mapeamento canal → componente', () => {
  const msg = { v: 1 as const, dev: 'esp32-hub', seq: 1, ch: { t1: 30, x: 1 } };
  it('dispositivo em teste não produz origem REAL', () => {
    const r = mapMessage(msg, device(), 'evs-1', NOW);
    expect(r.origin).toBeNull();
    expect(r.unmapped).toEqual(['x']);
  });
  it('dispositivo validado produz REAL com calibração', () => {
    const d = device({
      status: 'validado',
      channels: [
        { channel: 't1', componentId: 'hub-motor', quantity: 'temperature', unit: '°C', scale: 1.1, offset: -2 },
      ],
    });
    const r = mapMessage(msg, d, 'evs-1', NOW);
    expect(r.origin).toBe('REAL');
    expect(r.samples[0]).toMatchObject({
      componentId: 'hub-motor',
      value: 31,
      origin: 'REAL',
      timestamp: NOW,
      deviceId: 'esp32-hub',
    });
  });
  it('valor fora da faixa física fica inválido', () => {
    const r = mapMessage({ ...msg, ch: { t1: 999 } }, device({ status: 'validado' }), 'evs-1', NOW);
    expect(r.samples[0].quality).toBe('invalida');
    expect(r.warnings.length).toBe(1);
  });
  it('dispositivo desativado não gera amostras', () => {
    expect(mapMessage(msg, device({ status: 'desativado' }), 'evs-1', NOW).samples).toHaveLength(0);
  });
});

describe('adaptador de fluxo (via injeção manual)', () => {
  const setup = (d?: DeviceProfile) => {
    const a = new ManualEmgpAdapter((id) => (d && d.id === id ? d : undefined), 'evs-1');
    const real: TelemetrySample[] = [];
    const tests: TestConsoleEntry[] = [];
    const logs: string[] = [];
    a.subscribe((s) => real.push(s));
    a.onTest((e) => tests.push(e));
    a.onLog((e) => logs.push(e.message));
    return { a, real, tests, logs };
  };

  it('dispositivo não cadastrado vai só para o console', () => {
    const { a, real, tests } = setup();
    a.inject('{"v":1,"dev":"esp32-hub","seq":1,"ch":{"t1":30}}');
    expect(real).toHaveLength(0);
    expect(tests[0].error).toMatch(/não cadastrado/);
  });
  it('dispositivo em teste: console com amostras mapeadas, sem telemetria', () => {
    const { a, real, tests } = setup(device());
    a.inject('{"v":1,"dev":"esp32-hub","seq":1,"ch":{"t1":30}}');
    expect(real).toHaveLength(0);
    expect(tests[0].samples?.[0].value).toBe(30);
  });
  it('dispositivo validado: telemetria REAL; duplicata ignorada; perda registrada', () => {
    const { a, real, logs } = setup(device({ status: 'validado' }));
    a.inject(
      [
        '{"v":1,"dev":"esp32-hub","seq":1,"ch":{"t1":30}}',
        '{"v":1,"dev":"esp32-hub","seq":1,"ch":{"t1":30}}',
        '{"v":1,"dev":"esp32-hub","seq":4,"ch":{"t1":31}}',
      ].join('\n'),
    );
    expect(real.map((s) => s.value)).toEqual([30, 31]);
    expect(real.every((s) => s.origin === 'REAL')).toBe(true);
    expect(a.lostTotal).toBe(2);
    expect(logs.some((l) => l.includes('perdida'))).toBe(true);
  });
  it('linhas "#" são log do firmware; lixo vai para o console como erro', () => {
    const { a, tests, logs } = setup(device());
    a.inject('# boot ok\nlixo');
    expect(logs).toContain('# boot ok');
    expect(tests).toHaveLength(1);
    expect(tests[0].error).toBe('JSON inválido');
  });
});

describe('BLE Environmental Sensing (formatos GATT padrão)', () => {
  it('decodifica temperatura sint16 × 0,01 °C e umidade uint16 × 0,01 %', () => {
    const t = new DataView(new ArrayBuffer(2));
    t.setInt16(0, -1234, true);
    expect(BleEssAdapter.decodeTemperature(t)).toBeCloseTo(-12.34);
    const h = new DataView(new ArrayBuffer(2));
    h.setUint16(0, 5678, true);
    expect(BleEssAdapter.decodeHumidity(h)).toBeCloseTo(56.78);
  });
});
