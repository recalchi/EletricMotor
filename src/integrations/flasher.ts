import type { FlashPort } from '../platform/serial';
import { parseFirmwareAnnounce, type FirmwareAnnounce, type FirmwareArtifact, type FirmwareRelease } from './firmware';
import { md5Hex } from './md5';

/**
 * Atualização de firmware do gateway ESP32 pelo app (esptool-js sobre Web Serial ou USB OTG no APK).
 *
 * ÚNICO caminho do app que escreve no dispositivo — só roda por ação explícita na tela Firmware. Ordem fixa,
 * espelhando firmware/esp32-gateway/tools/atualizar-firmware.ps1: arquivos conferidos por SHA-256 → chip ESP32
 * com flash de 4 MB → eFuses sem criptografia/Secure Boot → tabela de partições compatível → backup lido em blocos
 * e conferido pelo MD5 do próprio chip → gravação com verificação de hash → reinício e confirmação da versão
 * anunciada (# fw). Qualquer falha antes da gravação aborta sem escrever nada. Uma gravação interrompida não
 * inutiliza a placa: o carregador de gravação do ESP32 fica em ROM e aceita nova tentativa.
 */

export type FlashMode = 'app' | 'completa';
export type StageId = 'arquivos' | 'conexao' | 'chip' | 'protecoes' | 'particoes' | 'backup' | 'gravacao' | 'verificacao' | 'reinicio';
export type StageState = 'pendente' | 'executando' | 'ok' | 'erro' | 'pulado';

export interface FlashStage {
  id: StageId;
  label: string;
  state: StageState;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  /** Progresso em bytes (ou itens) — base do tempo estimado. */
  done?: number;
  total?: number;
}

export interface FlashRun {
  id: string;
  startedAt: number;
  endedAt?: number;
  firmware: string;
  toVersion: string;
  fromVersion?: string;
  mode: FlashMode;
  result: 'executando' | 'sucesso' | 'falha';
  stages: FlashStage[];
  /** Resumo curto do erro, para leigos. */
  error?: string;
  /** Mensagem original (técnica). */
  errorDetail?: string;
  chip?: string;
  mac?: string;
  backup?: { name: string; size: number; md5: string; uri?: string };
  log: string[];
}

export const STAGE_LABELS: Record<StageId, string> = {
  arquivos: 'Conferir arquivos (SHA-256)',
  conexao: 'Conectar ao modo de gravação',
  chip: 'Identificar chip e flash',
  protecoes: 'Verificar proteções (eFuses)',
  particoes: 'Conferir tabela de partições',
  backup: 'Backup do firmware atual',
  gravacao: 'Gravar firmware',
  verificacao: 'Verificar gravação (MD5 do chip)',
  reinicio: 'Reiniciar e confirmar versão',
};

export const MODE_LABELS: Record<FlashMode, string> = {
  app: 'Atualização do aplicativo (mantém bootloader e partições)',
  completa: 'Instalação completa (bootloader + partições + aplicativo)',
};

export function newRun(release: FirmwareRelease, mode: FlashMode, fromVersion?: string, now = Date.now()): FlashRun {
  return {
    id: `fw-${now.toString(36)}`,
    startedAt: now,
    firmware: release.name,
    toVersion: release.version,
    fromVersion,
    mode,
    result: 'executando',
    stages: (Object.keys(STAGE_LABELS) as StageId[]).map((id) => ({ id, label: STAGE_LABELS[id], state: 'pendente' })),
    log: [],
  };
}

/** Partes gravadas em cada modo. "app" mantém bootloader e tabela já presentes na placa. */
export function filesFor(release: FirmwareRelease, mode: FlashMode): FirmwareArtifact[] {
  const all = release.artifacts ?? [];
  return mode === 'completa' ? all : all.filter((a) => a.role === 'otadata' || a.role === 'app');
}

// ───────────────────────── verificações (puras, testadas)

export function checkChip(chipName: string, description: string, flashSize: string): string | null {
  if (chipName !== 'ESP32') return `Chip ${chipName} não suportado — este firmware é para ESP32.`;
  if (!/ESP32-D0WD/i.test(description)) return `Variante ${description} não testada — esperado ESP32-D0WD (placa DevKit).`;
  if (flashSize !== '4MB') return `Flash de ${flashSize} — o firmware espera 4 MB.`;
  return null;
}

/** EFUSE_BLK0_RDATA0 (FLASH_CRYPT_CNT bits 20–26) e RDATA6 (ABS_DONE_0 bit 4, ABS_DONE_1 bit 5). */
export function checkEfuses(word0: number, word6: number): string | null {
  const cryptCnt = (word0 >>> 20) & 0x7f;
  let ones = 0;
  for (let v = cryptCnt; v; v >>= 1) ones += v & 1;
  if (ones % 2 === 1) return 'Criptografia de flash ATIVA — gravar texto puro inutilizaria o boot. Abortado.';
  if (word6 & (1 << 4)) return 'Secure Boot V1 ativo — imagem não assinada não iniciaria. Abortado.';
  if (word6 & (1 << 5)) return 'Secure Boot V2 ativo — imagem não assinada não iniciaria. Abortado.';
  return null;
}

export interface PartitionEntry {
  label: string;
  type: number;
  subtype: number;
  offset: number;
  size: number;
}

/** Tabela de partições ESP-IDF: entradas de 32 bytes com mágica 0x50AA, até a primeira entrada vazia. */
export function parsePartitionTable(raw: Uint8Array): PartitionEntry[] {
  const out: PartitionEntry[] = [];
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let off = 0; off + 32 <= raw.length; off += 32) {
    if (v.getUint16(off, true) !== 0x50aa) break;
    const name = raw.slice(off + 12, off + 28);
    const end = name.indexOf(0);
    out.push({
      type: raw[off + 2],
      subtype: raw[off + 3],
      offset: v.getUint32(off + 4, true),
      size: v.getUint32(off + 8, true),
      label: new TextDecoder().decode(end >= 0 ? name.slice(0, end) : name),
    });
  }
  return out;
}

/** Para gravar só o app: app0 (ota_0) em 0x10000 com espaço suficiente e otadata em 0xE000 / 8 KB. */
export function checkPartitionsForApp(entries: PartitionEntry[], appSize: number): string | null {
  if (!entries.length) return 'Placa sem tabela de partições válida — use Instalação completa.';
  const app0 = entries.find((e) => e.type === 0 && e.subtype === 0x10);
  const ota = entries.find((e) => e.type === 1 && e.subtype === 0);
  if (!app0 || app0.offset !== 0x10000)
    return 'Partição app0 não está em 0x10000 (firmware de outro projeto?) — use Instalação completa.';
  if (app0.size < appSize) return `app0 tem ${app0.size} bytes e o firmware ${appSize} — use Instalação completa.`;
  if (!ota || ota.offset !== 0xe000 || ota.size !== 0x2000)
    return 'Partição otadata ausente ou fora de 0xE000 — use Instalação completa.';
  return null;
}

/** Região salva antes de gravar: tudo o que será sobrescrito (e o app atual inteiro). */
export function backupRange(mode: FlashMode, entries: PartitionEntry[]): { offset: number; size: number } {
  const app0 = entries.find((e) => e.type === 0 && e.subtype === 0x10 && e.offset === 0x10000);
  const appEnd = 0x10000 + (app0?.size ?? 0x140000);
  return mode === 'app' ? { offset: 0xe000, size: appEnd - 0xe000 } : { offset: 0, size: appEnd };
}

/** Peso de cada etapa no progresso geral (proporcional à duração típica medida na placa real). */
const WEIGHTS: Record<StageId, number> = {
  arquivos: 2,
  conexao: 6,
  chip: 2,
  protecoes: 1,
  particoes: 2,
  backup: 35,
  gravacao: 40,
  verificacao: 2,
  reinicio: 10,
};

/** Progresso geral 0–1 (etapas puladas não contam). */
export function overallProgress(run: FlashRun): number {
  let total = 0;
  let done = 0;
  for (const s of run.stages) {
    if (s.state === 'pulado') continue;
    total += WEIGHTS[s.id];
    if (s.state === 'ok') done += WEIGHTS[s.id];
    else if (s.state === 'executando' && s.total) done += WEIGHTS[s.id] * Math.min(1, (s.done ?? 0) / s.total);
  }
  return total ? done / total : 0;
}

/** Tempo restante (s) pela taxa observada da etapa; null quando ainda não há base. */
export function etaSeconds(stage: FlashStage, now = Date.now()): number | null {
  if (stage.state !== 'executando' || !stage.startedAt || !stage.total || !stage.done) return null;
  const elapsed = (now - stage.startedAt) / 1000;
  if (elapsed < 1) return null;
  return Math.max(0, ((stage.total - stage.done) * elapsed) / stage.done);
}

const PANIC = /Guru Meditation|Brownout detector|abort\(\) was called|rst:0xc |Backtrace:|invalid header/i;

/** Confere o boot após gravar: sem pânico e com anúncio "# fw" da versão esperada. */
export function bootCheck(
  text: string,
  name: string,
  version: string,
): { ok: boolean; done: boolean; announce?: FirmwareAnnounce; problem?: string } {
  const panic = PANIC.exec(text);
  if (panic) return { ok: false, done: true, problem: `Erro no boot após gravar: "${panic[0]}".` };
  for (const line of text.split(/\r?\n/)) {
    const fw = parseFirmwareAnnounce(line);
    if (!fw) continue;
    if (fw.name === name && fw.version === version) return { ok: true, done: true, announce: fw };
    return { ok: false, done: true, announce: fw, problem: `A placa anunciou ${fw.name} ${fw.version}; esperado ${name} ${version}.` };
  }
  return { ok: false, done: false, problem: `Sem anúncio "# fw" de ${name} ${version} após reiniciar.` };
}

export class FlashError extends Error {}

/** Resumo curto e acionável para a tela + detalhe técnico para o log. */
export function summarizeError(e: unknown): { summary: string; detail: string } {
  const detail = e instanceof Error ? e.message : String(e);
  if (e instanceof FlashError) return { summary: detail, detail };
  const rules: [RegExp, string][] = [
    [/No port selected|NotFoundError|nenhum dispositivo/i, 'Nenhuma porta USB escolhida.'],
    [/Failed to connect|Timed out waiting for packet header|Couldn't sync|Wrong boot mode/i,
      'A placa não entrou no modo de gravação. Segure o botão BOOT, toque em EN/RST e tente de novo.'],
    [/MD5 of file does not match/i, 'A verificação falhou: o conteúdo gravado difere do arquivo. Repita a gravação.'],
    [/device has been lost|disconnected|NetworkError|The device was lost/i,
      'O cabo USB foi desconectado durante a operação. Reconecte e repita — a placa aceita nova gravação.'],
    [/Failed to open serial port|already open|Access denied|InvalidStateError/i,
      'A porta USB está em uso. Desconecte o adaptador USB em Conectividade e feche outros programas (monitor serial).'],
    [/permiss/i, 'Permissão de USB negada no Android. Toque em “Permitir” quando o sistema perguntar.'],
  ];
  for (const [re, summary] of rules) if (re.test(detail)) return { summary, detail };
  return { summary: detail.split('\n')[0].slice(0, 200), detail };
}

// ───────────────────────── execução

export interface UpdateDeps {
  port: FlashPort;
  /** Lê um arquivo do pacote do app (ex.: fetch em /firmware/...). */
  loadFile(path: string): Promise<Uint8Array>;
  sha256(data: Uint8Array): Promise<string>;
  saveBackup(name: string, data: Uint8Array): Promise<string | undefined>;
  onChange(run: FlashRun): void;
}

export interface UpdateOptions {
  mode: FlashMode;
  backup: boolean;
  fromVersion?: string;
  /** Velocidade após carregar o stub (115200 é o mais tolerante a cabos/adaptadores ruins). */
  baudrate?: number;
  /** Espera pelo anúncio da versão após o reinício. */
  bootTimeoutMs?: number;
}

const EFUSE_RD_REG_BASE = 0x3ff5a000;
/**
 * Tamanho do bloco de leitura do backup. NÃO aumentar sem rever isto: na leitura o esptool-js confirma cada pacote
 * de 4 KB enviando ao stub o total já recebido (4 bytes, little-endian). Se o stub sair da leitura (pacote perdido
 * nesta ponte CP2102) uma confirmação atrasada é lida como COMANDO: o 2º byte vira o código. Com blocos ≥ 0xD000 a
 * confirmação "00 D0 00 00" é ERASE_FLASH — em 30/10/2026 isso apagou a flash da placa durante um backup que falhou.
 * Com 0x4000 as confirmações vão de 0x1000 a 0x4000 (códigos 0x10–0x40), longe de 0xD0–0xD3 (apagar/ler/executar).
 */
export const READ_CHUNK = 0x4000;
/** Códigos do stub que nunca podem ser formados por uma confirmação de leitura. */
export const DANGEROUS_STUB_COMMANDS = [0xd0, 0xd1, 0xd2, 0xd3];
const READ_TRIES = 5;
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runFirmwareUpdate(release: FirmwareRelease, opts: UpdateOptions, deps: UpdateDeps): Promise<FlashRun> {
  const run = newRun(release, opts.mode, opts.fromVersion);
  let lastEmit = 0;
  const emit = (force = true) => {
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    deps.onChange(structuredClone(run));
  };
  const log = (m: string) => {
    run.log.push(`${new Date().toLocaleTimeString('pt-BR')} ${m}`);
    if (run.log.length > 500) run.log.shift();
  };
  const get = (id: StageId) => run.stages.find((s) => s.id === id)!;
  const stage = async <T>(id: StageId, fn: (st: FlashStage) => Promise<T>): Promise<T> => {
    const st = get(id);
    st.state = 'executando';
    st.startedAt = Date.now();
    log(`▶ ${st.label}`);
    emit();
    try {
      const r = await fn(st);
      st.state = 'ok';
      return r;
    } catch (e) {
      st.state = 'erro';
      throw e;
    } finally {
      st.endedAt = Date.now();
      if (st.detail) log(`  ${st.detail}`);
      emit();
    }
  };
  const skip = (id: StageId, why: string) => {
    const st = get(id);
    st.state = 'pulado';
    st.detail = why;
    emit();
  };

  emit();
  type Transport = import('esptool-js').Transport;
  let transport: Transport | null = null;
  try {
    const files = await stage('arquivos', async (st) => {
      const arts = filesFor(release, opts.mode);
      if (!release.path || !arts.length) throw new FlashError('Esta versão não tem arquivos para gravação pelo app.');
      st.total = arts.length;
      st.done = 0;
      const out: { a: FirmwareArtifact; data: Uint8Array }[] = [];
      for (const a of arts) {
        const data = await deps.loadFile(`${release.path}/${a.file}`);
        if (data.length !== a.size) throw new FlashError(`${a.file}: ${data.length} bytes, esperado ${a.size}.`);
        const h = await deps.sha256(data);
        if (h !== a.sha256) throw new FlashError(`${a.file}: SHA-256 não confere com o catálogo — arquivo corrompido.`);
        if ((a.role === 'app' || a.role === 'bootloader') && data[0] !== 0xe9)
          throw new FlashError(`${a.file}: não é uma imagem ESP32 válida.`);
        out.push({ a, data });
        st.done++;
        emit(false);
      }
      st.detail = `${arts.length} arquivo(s) conferidos: ${arts.map((a) => `${a.file} @ ${hex(a.address)}`).join(', ')}`;
      return out;
    });

    const { ESPLoader, Transport } = await import('esptool-js');
    transport = new Transport(deps.port as unknown as SerialPort, false);
    const loader = new ESPLoader({
      transport,
      baudrate: opts.baudrate ?? 115200,
      terminal: {
        clean: () => undefined,
        writeLine: (d: string) => d.trim() && log(`  esptool: ${d.trim()}`),
        write: (d: string) => d.trim() && log(`  esptool: ${d.trim()}`),
      },
    });

    // sem isto um pacote perdido trava a leitura por 100 s antes de falhar
    loader.FLASH_READ_TIMEOUT = 8000;
    const reconnect = async () => {
      await transport!.disconnect().catch(() => undefined);
      await sleep(300);
      loader.IS_STUB = false;
      await loader.main();
    };

    const description = await stage('conexao', async (st) => {
      const d = await loader.main();
      st.detail = `Conectado: ${d}`;
      return d;
    });

    await stage('chip', async (st) => {
      const flashSize = await loader.detectFlashSize();
      run.mac = await loader.chip.readMac(loader);
      run.chip = `${description} · flash ${flashSize}`;
      const err = checkChip(loader.chip.CHIP_NAME, description, flashSize);
      if (err) throw new FlashError(err);
      st.detail = `${run.chip} · MAC ${run.mac}`;
    });

    await stage('protecoes', async (st) => {
      const w0 = await loader.readReg(EFUSE_RD_REG_BASE);
      const w6 = await loader.readReg(EFUSE_RD_REG_BASE + 4 * 6);
      const err = checkEfuses(w0, w6);
      if (err) throw new FlashError(err);
      st.detail = 'Criptografia de flash e Secure Boot desligados (somente leitura dos eFuses).';
    });

    const app = files.find((f) => f.a.role === 'app')!;
    const entries = await stage('particoes', async (st) => {
      let raw: Uint8Array | null = null;
      for (let t = 1; t <= READ_TRIES && !raw; t++) {
        try {
          const d = await loader.readFlash(0x8000, 0xc00);
          if (md5Hex(d) === (await loader.flashMd5sum(0x8000, 0xc00))) raw = d;
        } catch (err) {
          log(`  aviso: leitura da tabela falhou (${summarizeError(err).detail.slice(0, 120)})`);
        }
        if (!raw) await reconnect();
      }
      if (!raw) throw new FlashError('Não foi possível ler a tabela de partições com segurança. Nada foi gravado.');
      const e = parsePartitionTable(raw);
      if (opts.mode === 'app') {
        const err = checkPartitionsForApp(e, app.data.length);
        if (err) throw new FlashError(err);
        st.detail = `app0 em 0x10000 (${Math.round(e.find((x) => x.subtype === 0x10)!.size / 1024)} KB) e otadata em 0xE000 — compatíveis.`;
      } else {
        st.detail = e.length
          ? `Tabela atual (${e.map((x) => x.label).join(', ')}) será substituída pela do firmware.`
          : 'Sem tabela válida na placa — será gravada.';
      }
      return e;
    });

    if (opts.backup) {
      await stage('backup', async (st) => {
        const { offset, size } = backupRange(opts.mode, entries);
        st.total = size;
        st.done = 0;
        const parts: Uint8Array[] = [];
        for (let off = offset; off < offset + size; off += READ_CHUNK) {
          const len = Math.min(READ_CHUNK, offset + size - off);
          let ok: Uint8Array | null = null;
          let lastErr: unknown;
          for (let t = 1; t <= READ_TRIES && !ok; t++) {
            try {
              const data = await loader.readFlash(off, len);
              const chipMd5 = await loader.flashMd5sum(off, len);
              if (md5Hex(data) === chipMd5) ok = data;
              else lastErr = new Error('MD5 do bloco lido difere do calculado pelo chip');
            } catch (e) {
              lastErr = e;
            }
            if (!ok) {
              log(`  aviso: bloco ${hex(off)} tentativa ${t} falhou (${summarizeError(lastErr).detail.slice(0, 120)})`);
              // o stub pode ter ficado no meio do envio: reinicia no modo de gravação e recarrega o stub
              await reconnect();
            }
          }
          if (!ok) throw new FlashError(`Backup: o bloco ${hex(off)} não pôde ser lido com segurança. Nada foi gravado.`);
          parts.push(ok);
          st.done += len;
          emit(false);
        }
        const all = new Uint8Array(size);
        let p = 0;
        for (const x of parts) {
          all.set(x, p);
          p += x.length;
        }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const name = `backup_${(run.mac ?? 'esp32').replace(/:/g, '')}_${stamp}_${hex(offset)}.bin`;
        const uri = await deps.saveBackup(name, all);
        run.backup = { name, size, md5: md5Hex(all), uri };
        st.detail = `${Math.round(size / 1024)} KB de ${hex(offset)} salvos em ${name}, cada bloco conferido pelo chip.`;
      });
    } else skip('backup', 'Desativado pelo usuário.');

    await stage('gravacao', async (st) => {
      const sizes = files.map((f) => f.data.length);
      const before = sizes.map((_, i) => sizes.slice(0, i).reduce((x, y) => x + y, 0));
      st.total = sizes.reduce((x, y) => x + y, 0);
      st.done = 0;
      await loader.writeFlash({
        fileArray: files.map((f) => ({ data: f.data, address: f.a.address })),
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (i, written, total) => {
          st.done = before[i] + Math.round((sizes[i] * written) / Math.max(1, total));
          emit(false);
        },
        calculateMD5Hash: md5Hex,
      });
      st.done = st.total;
      st.detail = `${Math.round(st.total / 1024)} KB gravados (compactados) em ${files.length} região(ões).`;
    });

    await stage('verificacao', async (st) => {
      for (const f of files) {
        const chipMd5 = await loader.flashMd5sum(f.a.address, f.data.length);
        if (chipMd5 !== f.a.md5) throw new FlashError(`Verificação: ${f.a.file} em ${hex(f.a.address)} difere do catálogo.`);
      }
      st.detail = 'MD5 calculado pelo chip confere com o catálogo em todas as regiões.';
    });

    await stage('reinicio', async (st) => {
      // o reinício é feito já com a porta de escuta aberta, para não perder o anúncio do boot
      await transport!.disconnect();
      transport = null;
      const t0 = Date.now();
      const text = await listenBoot(deps.port, opts.bootTimeoutMs ?? 20000, (txt) => bootCheck(txt, release.name, release.version).done);
      text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(-12)
        .forEach((l) => log(`  placa: ${l.slice(0, 160)}`));
      const r = bootCheck(text, release.name, release.version);
      if (!r.ok) throw new FlashError(r.problem!);
      st.detail = `Rodando ${release.name} ${release.version} — anúncio recebido ${((Date.now() - t0) / 1000).toFixed(1)} s após reiniciar.`;
    });

    run.result = 'sucesso';
  } catch (e) {
    const { summary, detail } = summarizeError(e);
    run.result = 'falha';
    run.error = summary;
    run.errorDetail = detail;
    log(`✖ ${detail}`);
  } finally {
    if (transport) await (transport as Transport).disconnect().catch(() => undefined);
    run.endedAt = Date.now();
    emit();
  }
  return run;
}

/** Abre a porta em 115200 e acumula o texto do boot até `enough` ou o prazo. */
async function listenBoot(port: FlashPort, timeoutMs: number, enough: (text: string) => boolean): Promise<string> {
  await port.open({ baudRate: 115200 });
  const reader = port.readable!.getReader();
  // pulso em EN pelo RTS com IO0 livre (DTR solto): reinício normal, como o botão EN da placa
  await port.setSignals({ dataTerminalReady: false, requestToSend: true });
  await sleep(120);
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  const dec = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !enough(text)) {
      const timer = new Promise<'t'>((r) => setTimeout(() => r('t'), Math.max(50, deadline - Date.now())));
      const r = await Promise.race([reader.read(), timer]);
      if (r === 't') break;
      if (r.done) break;
      if (r.value) text += dec.decode(r.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await port.close().catch(() => undefined);
  }
  return text;
}

// ───────────────────────── histórico (por aparelho)

const HISTORY_KEY = 'em.firmware.history.v1';

export function loadHistory(): FlashRun[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as FlashRun[];
  } catch {
    return [];
  }
}

export function saveToHistory(run: FlashRun): FlashRun[] {
  const list = [{ ...run, log: run.log.slice(-80) }, ...loadHistory().filter((r) => r.id !== run.id)].slice(0, 20);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // armazenamento indisponível: o histórico fica só nesta sessão
  }
  return list;
}
