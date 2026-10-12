/**
 * EMGP v1 — EletricMotor Gateway Protocol.
 *
 * Protocolo PRÓPRIO do projeto, usado entre gateways/sensores externos construídos pelo proprietário
 * (ex.: ESP32 com sensor de temperatura) e o EletricMotor. NÃO é um protocolo da Voltz EVS e não
 * descreve nenhuma interface interna da moto.
 *
 * Transporte: uma mensagem JSON por linha (`\n`), via USB serial, BLE (Nordic UART Service) ou HTTPS.
 *
 *   {"v":1,"dev":"esp32-01","seq":42,"ts":1791820000000,"ch":{"t1":31.25,"h1":55.2},"st":{"bat":3.91}}
 *
 * - v   versão do protocolo (1)
 * - dev identificador do dispositivo (3–40 caracteres [A-Za-z0-9_-])
 * - seq contador monotônico (detecção de perdas/duplicatas)
 * - ts  epoch UTC em ms (opcional; ausente → horário de recebimento)
 * - ch  canais numéricos { nomeDoCanal: valor }; o mapeamento canal → componente/grandeza fica no app
 * - st  status do dispositivo (opcional; bateria do módulo, rssi…) — não vira telemetria
 *
 * Este arquivo é compartilhado com as Cloud Functions (functions/) — não importar React/Firebase aqui.
 */

export const EMGP_VERSION = 1;
export const MAX_LINE_BYTES = 2048;
export const MAX_CHANNELS = 32;
/** Tolerância para relógio do dispositivo à frente do servidor. */
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** Amostras mais antigas que isso são rejeitadas (buffer offline máximo). */
export const MAX_PAST_AGE_MS = 7 * 24 * 3600_000;

export interface EmgpMessage {
  v: 1;
  dev: string;
  seq: number;
  ts?: number;
  ch: Record<string, number>;
  st?: Record<string, number | string>;
}

export type ParseResult = { ok: true; msg: EmgpMessage } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
const CH_RE = /^[A-Za-z0-9_]{1,24}$/;

export function parseEmgpLine(line: string, now = Date.now()): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, error: 'linha vazia' };
  if (trimmed.length > MAX_LINE_BYTES) return { ok: false, error: 'linha excede 2048 bytes' };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }
  return validateEmgp(raw, now);
}

export function validateEmgp(raw: unknown, now = Date.now()): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'mensagem não é objeto' };
  const o = raw as Record<string, unknown>;
  if (o.v !== EMGP_VERSION) return { ok: false, error: `versão não suportada: ${String(o.v)}` };
  if (typeof o.dev !== 'string' || !ID_RE.test(o.dev)) return { ok: false, error: 'campo "dev" inválido' };
  if (typeof o.seq !== 'number' || !Number.isInteger(o.seq) || o.seq < 0)
    return { ok: false, error: 'campo "seq" inválido' };
  if (o.ts !== undefined) {
    if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return { ok: false, error: 'campo "ts" inválido' };
    if (o.ts > now + MAX_FUTURE_SKEW_MS) return { ok: false, error: 'timestamp no futuro (relógio do dispositivo?)' };
    if (o.ts < now - MAX_PAST_AGE_MS) return { ok: false, error: 'timestamp antigo demais' };
  }
  if (!o.ch || typeof o.ch !== 'object' || Array.isArray(o.ch)) return { ok: false, error: 'campo "ch" ausente' };
  const entries = Object.entries(o.ch as Record<string, unknown>);
  if (!entries.length) return { ok: false, error: 'nenhum canal' };
  if (entries.length > MAX_CHANNELS) return { ok: false, error: 'canais demais' };
  const ch: Record<string, number> = {};
  for (const [k, v] of entries) {
    if (!CH_RE.test(k)) return { ok: false, error: `nome de canal inválido: ${k}` };
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `valor não numérico no canal ${k}` };
    ch[k] = v;
  }
  let st: Record<string, number | string> | undefined;
  if (o.st !== undefined) {
    if (!o.st || typeof o.st !== 'object' || Array.isArray(o.st)) return { ok: false, error: 'campo "st" inválido' };
    st = {};
    for (const [k, v] of Object.entries(o.st as Record<string, unknown>).slice(0, 16))
      if (typeof v === 'number' || typeof v === 'string') st[k] = typeof v === 'string' ? v.slice(0, 64) : v;
  }
  return { ok: true, msg: { v: 1, dev: o.dev, seq: o.seq, ts: o.ts as number | undefined, ch, st } };
}

/** Faixas de plausibilidade física (sanidade de sensor, NÃO limites de operação da moto). */
export const PLAUSIBLE: Record<string, [number, number]> = {
  temperature: [-40, 200],
  voltage: [0, 150],
  current: [-500, 500],
  power: [-50_000, 50_000],
  soc: [0, 100],
  soh: [0, 100],
  speed: [0, 250],
  rpm: [0, 20_000],
  energy: [0, 100],
  pressure: [0, 100],
  vibration: [0, 50],
  cycles: [0, 100_000],
  odometer: [0, 1_000_000],
  humidity: [0, 100],
};

export function isPlausible(quantity: string, value: number): boolean {
  const r = PLAUSIBLE[quantity];
  return !r || (value >= r[0] && value <= r[1]);
}

/** Divide um fluxo de bytes/strings em linhas completas (serial/BLE entregam pedaços). */
export class LineBuffer {
  private buf = '';
  push(chunk: string): string[] {
    this.buf += chunk;
    if (this.buf.length > MAX_LINE_BYTES * 4) this.buf = this.buf.slice(-MAX_LINE_BYTES); // descarta lixo
    const parts = this.buf.split(/\r?\n/);
    this.buf = parts.pop() ?? '';
    return parts.filter((p) => p.trim().length > 0);
  }
}

/** Detecta perdas e duplicatas pela sequência. */
export function seqGap(prev: number | null, next: number): { lost: number; duplicate: boolean; reset: boolean } {
  if (prev == null) return { lost: 0, duplicate: false, reset: false };
  if (next === prev) return { lost: 0, duplicate: true, reset: false };
  if (next < prev) return { lost: 0, duplicate: false, reset: true }; // dispositivo reiniciou
  return { lost: next - prev - 1, duplicate: false, reset: false };
}
