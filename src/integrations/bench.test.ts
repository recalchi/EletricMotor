import { describe, expect, it } from 'vitest';
import { benchChecks, benchLog, benchMessage, emptyBench, gatewayDevice, nextStep, type BenchState } from './bench';
import { latestRelease, parseFirmwareAnnounce, updateAdvice } from './firmware';
import { SerialAdapter } from './hardware/SerialAdapter';
import { parseEmgpLine } from './protocol';

// Formato real publicado pela placa com o firmware 1.1.0 (bancada, sem sensor) — capturado em 30/10/2026.
const line = (seq: number, ch: string, st = '"rssi":0,"up":12,"heap":194,"ble":0,"ds":"ausente"') =>
  `{"v":1,"dev":"esp32-hub","seq":${seq},"ch":{${ch}},"st":{${st}}}`;
const feed = (s: BenchState, l: string, transport = 'serial', at = 1000) => {
  const r = parseEmgpLine(l);
  if (!r.ok) throw new Error(r.error);
  return benchMessage(s, r.msg, transport, at);
};
const ctx = { registered: false, validated: false, cloudConnected: false };
const status = (s: BenchState, id: string, c = ctx) => benchChecks(s, c).find((x) => x.id === id)!.status;

describe('bateria de testes do gateway', () => {
  it('começa pedindo a conexão USB', () => {
    expect(nextStep(benchChecks(emptyBench(), ctx))?.id).toBe('usb');
  });

  it('conta mensagens e detecta perdas pela sequência', () => {
    let s = emptyBench();
    for (const seq of [0, 1, 2, 5]) s = feed(s, line(seq, '"v34":0.142,"d27":1,"tq13":1777'));
    expect(s.messages).toBe(4);
    expect(s.lost).toBe(2);
    expect(status(s, 'usb')).toBe('ok');
    expect(status(s, 'fluxo')).toBe('pendente');
  });

  it('ignora mensagens de outros dispositivos', () => {
    const r = parseEmgpLine('{"v":1,"dev":"outro-01","seq":1,"ch":{"t":1}}');
    expect(benchMessage(emptyBench(), (r as { ok: true; msg: never }).msg, 'serial', 1).messages).toBe(0);
  });

  it('testes de bancada só passam quando os dois estados aparecem', () => {
    let s = emptyBench();
    s = feed(s, line(0, '"v34":0.142,"d27":1,"tq13":1777'));
    expect(status(s, 'adc')).toBe('pendente');
    expect(status(s, 'din')).toBe('pendente');
    s = feed(s, line(1, '"v34":3.12,"d27":0,"tq13":1700'));
    expect(status(s, 'adc')).toBe('pendente'); // o 0,142 V do pino solto (antes do 3V3) não conta
    s = feed(s, line(2, '"v34":0.02,"d27":1,"tq13":600'));
    expect(status(s, 'adc')).toBe('ok');
    expect(status(s, 'din')).toBe('ok');
    expect(status(s, 'touch')).toBe('ok');
  });

  it('sensor ausente fica aguardando peça, não como falha', () => {
    const s = feed(emptyBench(), line(0, '"v34":0.1,"d27":1,"tq13":1777'));
    expect(status(s, 'temp')).toBe('aguardando_hw');
    expect(status(feed(s, line(1, '"t1":24.5,"v34":0.1,"d27":1,"tq13":1777', '"ds":"ok"')), 'temp')).toBe('ok');
  });

  it('firmware: 1.0.0 pede atualização, a versão do catálogo passa', () => {
    const old = parseFirmwareAnnounce('# fw name=esp32-gateway version=1.0.0 emgp=1 dev=esp32-hub')!;
    let s = benchLog(emptyBench(), '# fw …', old, updateAdvice(old));
    expect(status(s, 'firmware')).toBe('pendente');
    const cur = { ...old, version: latestRelease('esp32-gateway')!.version };
    s = benchLog(s, '# fw …', cur, updateAdvice(cur));
    expect(status(s, 'firmware')).toBe('ok');
  });

  it('firmware 1.2.0+: versão no status identifica sem esperar o anúncio (também por Bluetooth)', () => {
    const s = feed(emptyBench(), line(0, '"v34":0.1,"d27":1,"tq13":1777', '"ds":"ausente","fw":"1.2.0"'), 'ble-nus');
    expect(s.fw?.version).toBe('1.2.0');
    expect(status(s, 'firmware')).toBe('ok');
    const old = feed(emptyBench(), line(0, '"v34":0.1,"d27":1,"tq13":1777', '"fw":"1.1.0"'));
    expect(status(old, 'firmware')).toBe('pendente');
  });

  it('Bluetooth e nuvem são reconhecidos pelo transporte e pelo log de envio', () => {
    let s = feed(emptyBench(), line(0, '"v34":0.1,"d27":1,"tq13":1777'), 'ble-nus');
    expect(status(s, 'ble')).toBe('ok');
    expect(status(s, 'nuvem')).toBe('opcional');
    s = benchLog(s, '# ingest HTTP 200');
    expect(status(s, 'nuvem')).toBe('ok');
  });

  it('cadastro pronto usa o id do firmware e só mapeia t1 para a moto', () => {
    const d = gatewayDevice(1);
    expect(d.id).toBe('esp32-hub');
    expect(d.channels.map((c) => c.channel)).toEqual(['t1']);
    expect(status(emptyBench(), 'cadastro', { ...ctx, registered: true })).toBe('ok');
  });

  it('o adaptador avisa a bateria de testes mesmo sem dispositivo cadastrado', () => {
    const a = new SerialAdapter(() => undefined, 'evs-1');
    const seen: string[] = [];
    a.onMessage((m, t) => seen.push(`${m.dev}@${t}`));
    a.onFirmwareLine((_l, fw) => fw && seen.push(`fw ${fw.version}`));
    (a as unknown as { handleLine(l: string): void }).handleLine('# fw name=esp32-gateway version=1.1.0 dev=esp32-hub');
    (a as unknown as { handleLine(l: string): void }).handleLine(line(0, '"v34":0.1,"d27":1,"tq13":1777'));
    expect(seen).toEqual(['fw 1.1.0', 'esp32-hub@serial']);
  });
});
