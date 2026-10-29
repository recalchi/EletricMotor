import { describe, expect, it } from 'vitest';
import {
  FIRMWARE_CATALOG,
  compareVersions,
  latestRelease,
  parseFirmwareAnnounce,
  updateAdvice,
  type FirmwareRelease,
} from './firmware';
import { ManualEmgpAdapter } from './hardware/DeviceStreamAdapter';

// Linha real capturada da placa (ESP32-D0WD-V3) após gravar o gateway 1.0.0.
const REAL = '# fw name=esp32-gateway version=1.0.0 emgp=1 dev=esp32-hub chip_rev=301 sdk=v5.5.5';

const rel = (version: string): FirmwareRelease => ({ name: 'esp32-gateway', version, sha256: 'x', date: '', notes: '' });

describe('anúncio de firmware (# fw)', () => {
  it('interpreta a linha real do gateway', () => {
    expect(parseFirmwareAnnounce(REAL)).toEqual({
      name: 'esp32-gateway',
      version: '1.0.0',
      emgp: '1',
      dev: 'esp32-hub',
      chipRev: '301',
      sdk: 'v5.5.5',
    });
  });
  it('ignora outras linhas de log e anúncios incompletos', () => {
    expect(parseFirmwareAnnounce('# sensor DS18B20 desconectado')).toBeNull();
    expect(parseFirmwareAnnounce('{"v":1}')).toBeNull();
    expect(parseFirmwareAnnounce('# fw name=esp32-gateway')).toBeNull();
  });
  it('compara versões numericamente', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
  });
  it('orienta atualização conforme o catálogo', () => {
    const fw = parseFirmwareAnnounce(REAL)!;
    expect(updateAdvice(fw).status).toBe('atualizado');
    const adv = updateAdvice(fw, [rel('1.0.0'), rel('1.1.0')]);
    expect(adv.status).toBe('desatualizado');
    expect(adv.message).toMatch(/1\.0\.0 → 1\.1\.0/);
    expect(adv.message).toMatch(/atualizar-firmware\.ps1/);
    expect(updateAdvice({ ...fw, version: '9.0.0' }).status).toBe('mais_novo');
    expect(updateAdvice({ ...fw, name: 'outro' }).status).toBe('desconhecido');
  });
  it('catálogo tem a versão gravada e hash no formato SHA-256', () => {
    const l = latestRelease('esp32-gateway')!;
    expect(l.version).toBe('1.0.0');
    expect(FIRMWARE_CATALOG.every((r) => /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
  });
  it('o adaptador registra o firmware no status, sem gerar telemetria', () => {
    const a = new ManualEmgpAdapter(() => undefined, 'evs-1');
    const logs: string[] = [];
    a.onLog((e) => logs.push(e.message));
    a.inject(`${REAL}\n# sensor DS18B20 desconectado`);
    expect(a.status().firmware?.version).toBe('1.0.0');
    expect(a.status().firmwareAdvice?.status).toBe('atualizado');
    expect(a.status().samplesReceived).toBe(0);
    expect(logs.some((l) => l.includes('está atualizado'))).toBe(true);
  });
});
