/**
 * Versão de firmware dos gateways e orientação de atualização.
 *
 * O firmware anuncia-se com uma linha de log (não é telemetria):
 *   # fw name=esp32-gateway version=1.0.0 emgp=1 dev=esp32-hub chip_rev=301 sdk=v5.5.5
 * O app só LÊ essa linha. A gravação é feita no PC com o script
 * `firmware/esp32-gateway/tools/atualizar-firmware.ps1` (o app nunca grava firmware).
 */

export interface FirmwareAnnounce {
  name: string;
  version: string;
  emgp?: string;
  dev?: string;
  chipRev?: string;
  sdk?: string;
}

export interface FirmwareRelease {
  name: string;
  version: string;
  /** SHA-256 do binário completo (merged) para placas ESP32 Dev Module / 4 MB. */
  sha256: string;
  date: string;
  notes: string;
}

/** Catálogo das versões publicadas. Atualize junto com FW_VERSION no .ino. */
export const FIRMWARE_CATALOG: FirmwareRelease[] = [
  {
    name: 'esp32-gateway',
    version: '1.0.0',
    sha256: 'ee79bf5dd9b8c9a5735c29ba37d06962e1381ba50fb1df8e533ed3a5f6a0bd58',
    date: '2026-10-29',
    notes: 'Primeira versão com anúncio de versão (# fw). DS18B20 no GPIO 4, EMGP v1 por USB/BLE/HTTPS.',
  },
];

const FW_LINE = /^\s*#\s*fw\s+(.*)$/;

/** Reconhece a linha de anúncio; retorna null para qualquer outra linha. */
export function parseFirmwareAnnounce(line: string): FirmwareAnnounce | null {
  const m = FW_LINE.exec(line);
  if (!m) return null;
  const kv: Record<string, string> = {};
  for (const part of m[1].trim().split(/\s+/)) {
    const i = part.indexOf('=');
    if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1);
  }
  if (!kv.name || !kv.version) return null;
  return { name: kv.name, version: kv.version, emgp: kv.emgp, dev: kv.dev, chipRev: kv.chip_rev, sdk: kv.sdk };
}

/** Compara versões "a.b.c" numericamente (partes ausentes = 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type UpdateStatus = 'atualizado' | 'desatualizado' | 'mais_novo' | 'desconhecido';

export interface UpdateAdvice {
  status: UpdateStatus;
  latest?: FirmwareRelease;
  message: string;
}

export function latestRelease(name: string, catalog = FIRMWARE_CATALOG): FirmwareRelease | undefined {
  return catalog
    .filter((r) => r.name === name)
    .sort((x, y) => compareVersions(y.version, x.version))[0];
}

export function updateAdvice(fw: FirmwareAnnounce, catalog = FIRMWARE_CATALOG): UpdateAdvice {
  const latest = latestRelease(fw.name, catalog);
  if (!latest) {
    return { status: 'desconhecido', message: `Firmware "${fw.name}" ${fw.version} não está no catálogo do app.` };
  }
  const c = compareVersions(fw.version, latest.version);
  if (c === 0) return { status: 'atualizado', latest, message: `Firmware ${fw.name} ${fw.version} está atualizado.` };
  if (c > 0) {
    return { status: 'mais_novo', latest, message: `Firmware ${fw.version} é mais novo que o catálogo (${latest.version}).` };
  }
  return {
    status: 'desatualizado',
    latest,
    message:
      `Atualização disponível: ${fw.version} → ${latest.version}. No PC, rode ` +
      `firmware/esp32-gateway/tools/atualizar-firmware.ps1 (faz backup, valida e grava com verificação).`,
  };
}
