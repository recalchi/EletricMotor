/**
 * Versão de firmware dos gateways, catálogo de versões publicadas e orientação de atualização.
 *
 * O firmware anuncia-se com uma linha de log (não é telemetria):
 *   # fw name=esp32-gateway version=1.0.0 emgp=1 dev=esp32-hub chip_rev=301 sdk=v5.5.5
 * Os adaptadores de telemetria só LEEM essa linha. A gravação acontece apenas na tela Firmware (ação explícita
 * do usuário, com verificações e backup — ver integrations/flasher.ts) ou no PC com
 * `firmware/esp32-gateway/tools/atualizar-firmware.ps1`.
 */

export interface FirmwareAnnounce {
  name: string;
  version: string;
  emgp?: string;
  dev?: string;
  chipRev?: string;
  sdk?: string;
}

/** Uma parte gravável do firmware (layout padrão do Arduino ESP32 Dev Module, 4 MB). */
export interface FirmwareArtifact {
  role: 'bootloader' | 'particoes' | 'otadata' | 'app';
  file: string;
  address: number;
  size: number;
  sha256: string;
  /** MD5 que o próprio chip calcula sobre a região gravada (verificação pós-gravação). */
  md5: string;
}

export interface FirmwareRelease {
  name: string;
  version: string;
  /** SHA-256 do binário completo (merged, 4 MB) usado pelo script do PC. */
  sha256: string;
  date: string;
  notes: string;
  /** Pasta (em /public) com as partes; ausente = versão só disponível pelo script do PC. */
  path?: string;
  artifacts?: FirmwareArtifact[];
}

/** Catálogo das versões publicadas. Atualize junto com FW_VERSION no .ino. */
export const FIRMWARE_CATALOG: FirmwareRelease[] = [
  {
    name: 'esp32-gateway',
    version: '1.2.0',
    sha256: '0d740dcacb6a1f37b55535f89b30054b2225016ff30f35bfe23d48d5ab158a21',
    date: '2026-10-31',
    notes:
      'Versão do firmware em toda mensagem (st.fw) — o app identifica na hora, também por Bluetooth — e reanúncio a ' +
      'cada 10 s. Envio Bluetooth em pedaços do tamanho do MTU negociado (antes 180 bytes fixos podiam ser truncados).',
    path: 'firmware/esp32-gateway/1.2.0',
    artifacts: [
      {
        role: 'bootloader',
        file: 'bootloader.bin',
        address: 0x1000,
        size: 24992,
        sha256: '47bbbfca119fe87190f63a67af9d85adff6433bcf3812ec92a9b9c9416a53ad1',
        md5: '68acc136fae0daa0e5605d8b014254a4',
      },
      {
        role: 'particoes',
        file: 'partitions.bin',
        address: 0x8000,
        size: 3072,
        sha256: '148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1',
        md5: 'a039c66cd3488176037b616b7595fe72',
      },
      {
        role: 'otadata',
        file: 'boot_app0.bin',
        address: 0xe000,
        size: 8192,
        sha256: 'f94c5d786a7a8fab06ac5d10e33bf37711a6697636dc037559ea19cc410a17f0',
        md5: 'e6327541e2dc394ca2c3b3280ac0f39f',
      },
      {
        role: 'app',
        file: 'app.bin',
        address: 0x10000,
        size: 696784,
        sha256: '69177f3fecdc2d24dac0de4fa965cdf014096df5c5c784f338383d2e867b6046',
        md5: 'c0216f3948c6e8822012226b8ad106c2',
      },
    ],
  },  {
    name: 'esp32-gateway',
    version: '1.1.0',
    sha256: '7b5376925e938fa17a0ab0646529d035c1c983bc222838244a4d28b8f90d2c09',
    date: '2026-10-30',
    notes:
      'Bluetooth corrigido (UUID do serviço NUS volta ao anúncio; nome na resposta de varredura). Publica sempre, mesmo ' +
      'sem sensor, com canais de bancada v34 (tensão GPIO34), d27 (entrada GPIO27) e tq13 (toque GPIO13) e status ' +
      'up/heap/ble/ds — testes só com jumpers.',
    path: 'firmware/esp32-gateway/1.1.0',
    artifacts: [
      {
        role: 'bootloader',
        file: 'bootloader.bin',
        address: 0x1000,
        size: 24992,
        sha256: '47bbbfca119fe87190f63a67af9d85adff6433bcf3812ec92a9b9c9416a53ad1',
        md5: '68acc136fae0daa0e5605d8b014254a4',
      },
      {
        role: 'particoes',
        file: 'partitions.bin',
        address: 0x8000,
        size: 3072,
        sha256: '148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1',
        md5: 'a039c66cd3488176037b616b7595fe72',
      },
      {
        role: 'otadata',
        file: 'boot_app0.bin',
        address: 0xe000,
        size: 8192,
        sha256: 'f94c5d786a7a8fab06ac5d10e33bf37711a6697636dc037559ea19cc410a17f0',
        md5: 'e6327541e2dc394ca2c3b3280ac0f39f',
      },
      {
        role: 'app',
        file: 'app.bin',
        address: 0x10000,
        size: 696640,
        sha256: '36ee15e7a052d3531313540d06d4c7c593ef7cdd4a474dc68e78d5912d26fbb7',
        md5: '18035270d2f613bd6555bab9692dd871',
      },
    ],
  },
  {
    name: 'esp32-gateway',
    version: '1.0.0',
    sha256: 'ee79bf5dd9b8c9a5735c29ba37d06962e1381ba50fb1df8e533ed3a5f6a0bd58',
    date: '2026-10-29',
    notes: 'Primeira versão com anúncio de versão (# fw). DS18B20 no GPIO 4, EMGP v1 por USB/BLE/HTTPS.',
    path: 'firmware/esp32-gateway/1.0.0',
    artifacts: [
      {
        role: 'bootloader',
        file: 'bootloader.bin',
        address: 0x1000,
        size: 24992,
        sha256: '47bbbfca119fe87190f63a67af9d85adff6433bcf3812ec92a9b9c9416a53ad1',
        md5: '68acc136fae0daa0e5605d8b014254a4',
      },
      {
        role: 'particoes',
        file: 'partitions.bin',
        address: 0x8000,
        size: 3072,
        sha256: '148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1',
        md5: 'a039c66cd3488176037b616b7595fe72',
      },
      {
        role: 'otadata',
        file: 'boot_app0.bin',
        address: 0xe000,
        size: 8192,
        sha256: 'f94c5d786a7a8fab06ac5d10e33bf37711a6697636dc037559ea19cc410a17f0',
        md5: 'e6327541e2dc394ca2c3b3280ac0f39f',
      },
      {
        role: 'app',
        file: 'app.bin',
        address: 0x10000,
        size: 673968,
        sha256: '7cd5cf4d8d88a883b82388a1ba05961fbc02134a415ee5f279dc42ef6b64380f',
        md5: '010e3fbdd675467c28894de2614fe755',
      },
    ],
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
      `Atualização disponível: ${fw.version} → ${latest.version}. Atualize na tela Firmware do app ou, no PC, ` +
      `com firmware/esp32-gateway/tools/atualizar-firmware.ps1 (ambos fazem backup, validam e gravam com verificação).`,
  };
}
