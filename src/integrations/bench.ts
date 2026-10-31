import type { DeviceProfile } from '../domain/types';
import { updateAdvice, type FirmwareAnnounce, type UpdateAdvice } from './firmware';
import type { EmgpMessage } from './protocol';

/**
 * Bateria de testes do gateway ESP32 (bancada). Acompanha TODAS as mensagens do gateway — validado ou não — e
 * transforma o que já foi observado em verificações com próximo passo. Os canais de bancada (v34, d27, tq13, firmware
 * ≥ 1.1.0) só servem para testar o caminho completo com jumpers; nunca são mapeados para componentes da moto.
 */

export const GATEWAY_DEV = 'esp32-hub';

/** Cadastro pronto do gateway: id igual ao DEVICE_ID do firmware; só t1 vira leitura da moto (motor hub). */
export function gatewayDevice(now = Date.now()): DeviceProfile {
  return {
    id: GATEWAY_DEV,
    name: 'Gateway ESP32 (esp32-hub)',
    firmware: 'esp32-gateway',
    transport: 'serial',
    sensorCandidateId: 'temp-hub-surface',
    channels: [{ channel: 't1', componentId: 'hub-motor', quantity: 'temperature', unit: '°C', scale: 1, offset: 0 }],
    status: 'teste',
    createdAt: now,
    sampleValidityMs: 30_000,
  };
}

export interface Range {
  min: number;
  max: number;
  last: number;
}

export interface BenchState {
  messages: number;
  lost: number;
  lastSeq?: number;
  firstAt?: number;
  lastAt?: number;
  transports: string[];
  fw?: FirmwareAnnounce;
  advice?: UpdateAdvice;
  ch: Record<string, Range>;
  st: Record<string, number | string>;
  ingestOk: number;
  ingestFail: number;
  /** GPIO34: um pino solto já lê ~0,1 V — só vale "GND" se vier DEPOIS de ter visto o 3V3. */
  adcHigh: boolean;
  adcLowAfterHigh: boolean;
}

export const emptyBench = (): BenchState => ({
  messages: 0,
  lost: 0,
  transports: [],
  ch: {},
  st: {},
  ingestOk: 0,
  ingestFail: 0,
  adcHigh: false,
  adcLowAfterHigh: false,
});

export function benchMessage(s: BenchState, msg: EmgpMessage, transport: string, at: number): BenchState {
  if (msg.dev !== GATEWAY_DEV) return s;
  let lost = s.lost;
  if (s.lastSeq != null && msg.seq > s.lastSeq + 1) lost += msg.seq - s.lastSeq - 1;
  const ch = { ...s.ch };
  for (const [k, v] of Object.entries(msg.ch)) {
    const r = ch[k];
    ch[k] = r ? { min: Math.min(r.min, v), max: Math.max(r.max, v), last: v } : { min: v, max: v, last: v };
  }
  const v34 = msg.ch.v34;
  const adcHigh = s.adcHigh || (v34 != null && v34 >= 2.8);
  const adcLowAfterHigh = s.adcLowAfterHigh || (s.adcHigh && v34 != null && v34 <= 0.3);
  // Firmware ≥ 1.2.0 manda a versão em toda mensagem (st.fw): identifica na hora, inclusive por Bluetooth
  const stFw = typeof msg.st?.fw === 'string' ? msg.st.fw : undefined;
  const fw = stFw && s.fw?.version !== stFw ? { ...s.fw, name: s.fw?.name ?? 'esp32-gateway', version: stFw, dev: msg.dev } : s.fw;
  return {
    ...s,
    fw,
    advice: fw !== s.fw && fw ? updateAdvice(fw) : s.advice,
    adcHigh,
    adcLowAfterHigh,
    messages: s.messages + 1,
    lost,
    lastSeq: msg.seq,
    firstAt: s.firstAt ?? at,
    lastAt: at,
    transports: s.transports.includes(transport) ? s.transports : [...s.transports, transport],
    ch,
    st: { ...s.st, ...(msg.st ?? {}) },
  };
}

/** Linhas "#" do firmware: anúncio de versão e resultado do envio pela internet. */
export function benchLog(s: BenchState, line: string, fw?: FirmwareAnnounce, advice?: UpdateAdvice): BenchState {
  const http = /# ingest HTTP (-?\d+)/.exec(line);
  return {
    ...s,
    fw: fw && fw.dev === GATEWAY_DEV ? fw : s.fw,
    advice: fw && fw.dev === GATEWAY_DEV ? advice : s.advice,
    ingestOk: s.ingestOk + (http && http[1] === '200' ? 1 : 0),
    ingestFail: s.ingestFail + (http && http[1] !== '200' ? 1 : 0),
  };
}

export type CheckStatus = 'ok' | 'pendente' | 'aguardando_hw' | 'opcional';

export interface BenchCheck {
  id: string;
  group: 'conexao' | 'bancada' | 'sensores' | 'cadastro';
  label: string;
  status: CheckStatus;
  detail: string;
  /** O que fazer para avançar (quando não está ok). */
  howTo: string;
}

export interface BenchContext {
  registered: boolean;
  validated: boolean;
  cloudConnected: boolean;
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export function benchChecks(s: BenchState, ctx: BenchContext): BenchCheck[] {
  const has = (t: string) => s.transports.includes(t);
  const v = s.ch.v34;
  const d = s.ch.d27;
  const tq = s.ch.tq13;
  const noBench = 'Exige firmware 1.1.0 ou mais novo — atualize na tela Firmware.';
  const ds = s.st.ds;
  return [
    {
      id: 'usb',
      group: 'conexao',
      label: 'Conexão USB',
      status: has('serial') ? 'ok' : 'pendente',
      detail: has('serial') ? 'Mensagens recebidas pelo cabo USB.' : 'Nenhuma mensagem pelo USB ainda.',
      howTo:
        'Conecte o ESP32 por cabo e toque em Conectar em “Gateway USB”. No celular use cabo OTG; no PC, Chrome ou Edge.',
    },
    {
      id: 'firmware',
      group: 'conexao',
      label: 'Firmware identificado e atualizado',
      status: s.advice?.status === 'atualizado' || s.advice?.status === 'mais_novo' ? 'ok' : 'pendente',
      detail: s.fw ? `${s.fw.name} ${s.fw.version} — ${s.advice?.message ?? ''}` : 'Anúncio de versão ainda não recebido.',
      howTo: s.fw
        ? 'Abra a tela Firmware e atualize (no computador, pelo Chrome/Edge).'
        : 'Conecte e aguarde: a 1.2.0+ informa a versão em toda mensagem; a 1.1.0 só no boot e a cada minuto.',
    },
    {
      id: 'fluxo',
      group: 'conexao',
      label: 'Mensagens chegando sem perdas',
      status: s.messages >= 5 && s.lost === 0 ? 'ok' : 'pendente',
      detail: `${s.messages} mensagem(ns), ${s.lost} perdida(s).`,
      howTo:
        s.lost > 0
          ? 'Perdas indicam cabo/conexão instável: troque o cabo ou aproxime o celular (Bluetooth).'
          : 'Mantenha conectado por ~10 s (uma mensagem a cada 2 s).',
    },
    {
      id: 'ble',
      group: 'conexao',
      label: 'Bluetooth (UART/NUS)',
      status: has('ble-nus') ? 'ok' : 'pendente',
      detail: has('ble-nus') ? 'Mensagens recebidas por Bluetooth.' : 'Nenhuma mensagem por Bluetooth ainda.',
      howTo:
        'Desconecte o USB do app (a placa pode continuar no cabo só para energia), toque em Conectar em “Gateway Bluetooth” e escolha esp32-hub. No celular, permita “Dispositivos próximos”; se a lista ficar vazia, instale o APK 0.8.1+ (corrige a permissão de busca). Firmware 1.0.0 não aparece — use 1.1.0+.',
    },
    {
      id: 'adc',
      group: 'bancada',
      label: 'Entrada analógica GPIO34 (v34)',
      status: s.adcLowAfterHigh ? 'ok' : 'pendente',
      detail: v
        ? `agora ${fmt(v.last)} V · 3V3 ${s.adcHigh ? 'visto' : 'pendente'} · GND depois ${s.adcLowAfterHigh ? 'visto' : 'pendente'}`
        : noBench,
      howTo: 'Jumper do GPIO34 ao 3V3 (deve ir a ~3,1 V) e DEPOIS ao GND (~0 V). Solto, o pino lê valores aleatórios.',
    },
    {
      id: 'din',
      group: 'bancada',
      label: 'Entrada digital GPIO27 (d27)',
      status: d && d.min === 0 && d.max === 1 ? 'ok' : 'pendente',
      detail: d ? `agora ${d.last} · já viu ${d.min === 0 ? '0' : ''}${d.min === 0 && d.max === 1 ? ' e ' : ''}${d.max === 1 ? '1' : ''}` : noBench,
      howTo: 'Solto ele lê 1. Ligue um jumper do GPIO27 ao GND por alguns segundos: deve ler 0.',
    },
    {
      id: 'touch',
      group: 'bancada',
      label: 'Toque capacitivo GPIO13 (tq13)',
      status: tq && tq.min <= tq.max * 0.6 ? 'ok' : 'pendente',
      detail: tq ? `agora ${tq.last} · mín ${tq.min} · máx ${tq.max}` : noBench,
      howTo: 'Ponha um jumper no GPIO13 com a outra ponta solta e encoste o dedo nela: o valor deve cair bem.',
    },
    {
      id: 'temp',
      group: 'sensores',
      label: 'Temperatura DS18B20 (t1)',
      status: s.ch.t1 ? 'ok' : ds === 'ausente' ? 'aguardando_hw' : 'pendente',
      detail: s.ch.t1 ? `agora ${fmt(s.ch.t1.last, 1)} °C` : ds === 'ausente' ? 'Placa informa: sensor ausente.' : 'Sem leitura.',
      howTo:
        'Quando chegarem: DS18B20 VCC→3V3, GND→GND, DATA→GPIO4 e resistor de 4,7 kΩ entre DATA e 3V3. Teste na protoboard antes da moto.',
    },
    {
      id: 'cadastro',
      group: 'cadastro',
      label: 'Gateway cadastrado no app',
      status: ctx.registered ? 'ok' : 'pendente',
      detail: ctx.registered ? 'esp32-hub cadastrado.' : 'Sem cadastro: as mensagens só aparecem no console de teste.',
      howTo: 'Toque em “Cadastrar gateway” (modelo pronto: canal t1 → temperatura do motor hub).',
    },
    {
      id: 'validacao',
      group: 'cadastro',
      label: 'Dispositivo validado (leituras viram REAL)',
      status: ctx.validated ? 'ok' : s.ch.t1 ? 'pendente' : 'aguardando_hw',
      detail: ctx.validated ? 'Validado.' : 'Só faz sentido com o sensor de temperatura ligado e conferido.',
      howTo: 'Com o DS18B20 instalado, compare com um termômetro de referência e use “Validar” em Dispositivos.',
    },
    {
      id: 'nuvem',
      group: 'conexao',
      label: 'Nuvem (HTTPS)',
      status: s.ingestOk > 0 || ctx.cloudConnected ? 'ok' : 'opcional',
      detail:
        s.ingestOk > 0
          ? `Gateway enviou à nuvem (${s.ingestOk} lote(s) OK, ${s.ingestFail} falha(s)).`
          : ctx.cloudConnected
            ? 'App conectado à nuvem (Firebase). Envio direto do gateway: Wi‑Fi não configurado no firmware.'
            : 'Opcional.',
      howTo:
        'Envio direto do gateway exige Wi‑Fi e token no secrets.h do firmware (compilar no PC). Não é necessário para USB/Bluetooth.',
    },
  ];
}

export function nextStep(checks: BenchCheck[]): BenchCheck | undefined {
  return checks.find((c) => c.status === 'pendente');
}
