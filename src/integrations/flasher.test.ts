import { describe, expect, it } from 'vitest';
import { FIRMWARE_CATALOG } from './firmware';
import {
  DANGEROUS_STUB_COMMANDS,
  FlashError,
  READ_CHUNK,
  backupRange,
  bootCheck,
  checkChip,
  checkEfuses,
  checkPartitionsForApp,
  etaSeconds,
  filesFor,
  newRun,
  overallProgress,
  parsePartitionTable,
  summarizeError,
  type PartitionEntry,
} from './flasher';
import { md5Hex } from './md5';

/** Tabela no formato binário do ESP-IDF a partir de entradas. */
function table(entries: [string, number, number, number, number][]): Uint8Array {
  const raw = new Uint8Array(0xc00).fill(0xff);
  const v = new DataView(raw.buffer);
  entries.forEach(([label, type, subtype, offset, size], i) => {
    const o = i * 32;
    v.setUint16(o, 0x50aa, true);
    raw[o + 2] = type;
    raw[o + 3] = subtype;
    v.setUint32(o + 4, offset, true);
    v.setUint32(o + 8, size, true);
    raw.fill(0, o + 12, o + 28);
    raw.set(new TextEncoder().encode(label), o + 12);
    v.setUint32(o + 28, 0, true);
  });
  return raw;
}

// Tabela padrão do gateway (partitions.csv do build) e a do ESP-AT de fábrica (app em 0x100000).
const GATEWAY: [string, number, number, number, number][] = [
  ['nvs', 1, 2, 0x9000, 0x5000],
  ['otadata', 1, 0, 0xe000, 0x2000],
  ['app0', 0, 0x10, 0x10000, 0x140000],
  ['app1', 0, 0x11, 0x150000, 0x140000],
  ['spiffs', 1, 0x82, 0x290000, 0x160000],
  ['coredump', 1, 3, 0x3f0000, 0x10000],
];
const ESP_AT: [string, number, number, number, number][] = [
  ['otadata', 1, 0, 0xd000, 0x2000],
  ['ota_0', 0, 0x10, 0x100000, 0x180000],
  ['ota_1', 0, 0x11, 0x280000, 0x180000],
];

describe('md5', () => {
  it('confere com vetores do RFC 1321', () => {
    expect(md5Hex(new Uint8Array())).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex(new TextEncoder().encode('a'.repeat(1000)))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });
});

describe('verificações antes de gravar', () => {
  it('aceita só ESP32-D0WD com 4 MB', () => {
    expect(checkChip('ESP32', 'ESP32-D0WD-V3 (revision v3.1)', '4MB')).toBeNull();
    expect(checkChip('ESP32-S3', 'ESP32-S3 (QFN56)', '4MB')).toMatch(/não suportado/);
    expect(checkChip('ESP32', 'ESP32-D0WD-V3', '2MB')).toMatch(/4 MB/);
  });
  it('aborta com criptografia ou Secure Boot ativos', () => {
    expect(checkEfuses(0, 0)).toBeNull();
    expect(checkEfuses(1 << 20, 0)).toMatch(/Criptografia/);
    expect(checkEfuses(3 << 20, 0)).toBeNull(); // contagem par = desligada
    expect(checkEfuses(0, 1 << 4)).toMatch(/Secure Boot V1/);
    expect(checkEfuses(0, 1 << 5)).toMatch(/Secure Boot V2/);
  });
  it('lê a tabela de partições do gateway', () => {
    const e = parsePartitionTable(table(GATEWAY));
    expect(e.map((x) => x.label)).toEqual(['nvs', 'otadata', 'app0', 'app1', 'spiffs', 'coredump']);
    expect(e[2]).toEqual({ label: 'app0', type: 0, subtype: 0x10, offset: 0x10000, size: 0x140000 });
    expect(parsePartitionTable(new Uint8Array(0xc00).fill(0xff))).toEqual([]);
  });
  it('só grava o app quando a tabela é compatível', () => {
    const app = 673968;
    expect(checkPartitionsForApp(parsePartitionTable(table(GATEWAY)), app)).toBeNull();
    expect(checkPartitionsForApp(parsePartitionTable(table(ESP_AT)), app)).toMatch(/Instalação completa/);
    expect(checkPartitionsForApp([], app)).toMatch(/Instalação completa/);
    expect(checkPartitionsForApp(parsePartitionTable(table(GATEWAY)), 0x200000)).toMatch(/Instalação completa/);
  });
  it('o backup cobre toda a região que será sobrescrita', () => {
    const e: PartitionEntry[] = parsePartitionTable(table(GATEWAY));
    expect(backupRange('app', e)).toEqual({ offset: 0xe000, size: 0x150000 - 0xe000 });
    expect(backupRange('completa', e)).toEqual({ offset: 0, size: 0x150000 });
    // sem tabela conhecida: assume o layout padrão
    expect(backupRange('completa', [])).toEqual({ offset: 0, size: 0x150000 });
    for (const a of FIRMWARE_CATALOG[0].artifacts!) {
      const r = backupRange('completa', e);
      expect(a.address + a.size).toBeLessThanOrEqual(r.offset + r.size);
    }
  });
});

describe('arquivos do catálogo', () => {
  const rel = FIRMWARE_CATALOG[0];
  it('modo app grava otadata + app; completo grava as 4 partes', () => {
    expect(filesFor(rel, 'app').map((a) => a.address)).toEqual([0xe000, 0x10000]);
    expect(filesFor(rel, 'completa').map((a) => a.address)).toEqual([0x1000, 0x8000, 0xe000, 0x10000]);
  });
  it('partes não se sobrepõem e cabem em app0', () => {
    const arts = filesFor(rel, 'completa');
    for (let i = 1; i < arts.length; i++) expect(arts[i - 1].address + arts[i - 1].size).toBeLessThanOrEqual(arts[i].address);
    expect(arts[arts.length - 1].size).toBeLessThanOrEqual(0x140000);
    expect(arts.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && /^[0-9a-f]{32}$/.test(a.md5))).toBe(true);
  });
});

describe('confirmação após reiniciar', () => {
  const ok = 'ets Jun  8 2016\nentry 0x400805b4\n# fw name=esp32-gateway version=1.0.0 emgp=1 dev=esp32-hub\n';
  it('exige o anúncio da versão gravada', () => {
    expect(bootCheck(ok, 'esp32-gateway', '1.0.0')).toMatchObject({ ok: true, done: true });
    expect(bootCheck(ok, 'esp32-gateway', '1.1.0')).toMatchObject({ ok: false, done: true });
    expect(bootCheck('entry 0x400805b4\n', 'esp32-gateway', '1.0.0')).toMatchObject({ ok: false, done: false });
  });
  it('detecta pânico e brownout', () => {
    expect(bootCheck("Guru Meditation Error: Core  1 panic'ed", 'esp32-gateway', '1.0.0').problem).toMatch(/Guru/);
    expect(bootCheck('Brownout detector was triggered', 'esp32-gateway', '1.0.0').ok).toBe(false);
  });
});

describe('monitoramento', () => {
  it('estima o tempo restante pela taxa observada', () => {
    const now = 100_000;
    const st = { id: 'gravacao' as const, label: '', state: 'executando' as const, startedAt: now - 10_000, done: 250, total: 1000 };
    expect(etaSeconds(st, now)).toBeCloseTo(30);
    expect(etaSeconds({ ...st, done: 0 }, now)).toBeNull();
    expect(etaSeconds({ ...st, state: 'ok' }, now)).toBeNull();
  });
  it('resume erros comuns em linguagem simples', () => {
    expect(summarizeError(new Error('Failed to connect with the device')).summary).toMatch(/BOOT/);
    expect(summarizeError(new Error('MD5 of file does not match data in flash!')).summary).toMatch(/Repita/);
    expect(summarizeError(new Error('Failed to open serial port.')).summary).toMatch(/em uso/);
    expect(summarizeError(new FlashError('Flash de 2MB')).summary).toBe('Flash de 2MB');
  });
  it('progresso geral cresce até 100% e ignora etapas puladas', () => {
    const r = newRun(FIRMWARE_CATALOG[0], 'app', undefined, 1);
    expect(overallProgress(r)).toBe(0);
    r.stages.forEach((s) => (s.state = s.id === 'backup' ? 'pulado' : 'ok'));
    expect(overallProgress(r)).toBe(1);
    const g = r.stages.find((s) => s.id === 'gravacao')!;
    Object.assign(g, { state: 'executando', done: 50, total: 100 });
    expect(overallProgress(r)).toBeGreaterThan(0.6);
    expect(overallProgress(r)).toBeLessThan(1);
  });
  it('nova execução lista todas as etapas como pendentes', () => {
    const r = newRun(FIRMWARE_CATALOG[0], 'app', '1.0.0', 1);
    expect(r.stages).toHaveLength(9);
    expect(r.stages.every((s) => s.state === 'pendente')).toBe(true);
  });
});

describe('segurança da leitura (incidente de 30/10/2026)', () => {
  it('nenhuma confirmação de leitura pode virar comando de apagar/ler/executar do stub', () => {
    // confirmações = total recebido após cada pacote de 4 KB (e o tamanho final do bloco)
    for (const size of [READ_CHUNK, 0xc00]) {
      for (let n = 0x1000; n <= size; n += 0x1000) {
        const ack = [n & 0xff, (n >> 8) & 0xff];
        expect(DANGEROUS_STUB_COMMANDS).not.toContain(ack[1]);
      }
      expect(DANGEROUS_STUB_COMMANDS).not.toContain((size >> 8) & 0xff);
    }
    expect(READ_CHUNK).toBeLessThan(0xd000);
  });
});
