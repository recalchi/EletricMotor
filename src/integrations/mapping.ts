import type { DataOrigin, DeviceProfile, TelemetrySample } from '../domain/types';
import { isPlausible, type EmgpMessage } from './protocol';

export const MAPPING_VERSION = 'emgp-map-1.0.0';

/** Canais de bancada do gateway ESP32 (jumpers): servem só aos testes, nunca viram telemetria nem aviso. */
export const BENCH_CHANNELS = ['v34', 'd27', 'tq13'];

export interface MappedResult {
  /** Origem atribuída: REAL somente para dispositivo validado; null = modo teste (não entra na telemetria). */
  origin: DataOrigin | null;
  samples: TelemetrySample[];
  /** Canais da mensagem sem mapeamento no cadastro. */
  unmapped: string[];
  /** Avisos por canal (fora da faixa física etc.). */
  warnings: string[];
}

/**
 * Converte uma mensagem EMGP em amostras do domínio usando o cadastro do dispositivo.
 * Pura e compartilhada com as Cloud Functions.
 */
export function mapMessage(
  msg: EmgpMessage,
  device: DeviceProfile,
  vehicleId: string,
  receivedAt: number,
  parserVersion = MAPPING_VERSION,
): MappedResult {
  const origin: DataOrigin | null = device.status === 'validado' ? 'REAL' : null;
  const ts = msg.ts ?? receivedAt;
  const samples: TelemetrySample[] = [];
  const warnings: string[] = [];
  const mapped = new Set<string>();

  if (device.status === 'desativado')
    return { origin: null, samples, unmapped: [], warnings: ['dispositivo desativado'] };

  for (const ch of device.channels) {
    const raw = msg.ch[ch.channel];
    if (raw === undefined) continue;
    mapped.add(ch.channel);
    const value = raw * (Number.isFinite(ch.scale) ? ch.scale : 1) + (Number.isFinite(ch.offset) ? ch.offset : 0);
    const plausible = isPlausible(ch.quantity, value);
    if (!plausible) warnings.push(`${ch.channel}: ${value} ${ch.unit} fora da faixa física plausível`);
    samples.push({
      vehicleId,
      componentId: ch.componentId,
      sensorId: `${device.id}:${ch.channel}`,
      quantity: ch.quantity,
      value: Math.round(value * 1000) / 1000,
      unit: ch.unit,
      timestamp: ts,
      origin: origin ?? 'INDISPONIVEL',
      quality: plausible ? 'boa' : 'invalida',
      validForMs: device.sampleValidityMs,
      parserVersion,
      deviceId: device.id,
    });
  }
  const unmapped = Object.keys(msg.ch).filter((k) => !mapped.has(k) && !BENCH_CHANNELS.includes(k));
  return { origin, samples, unmapped, warnings };
}

/** Checklist mínimo para promover um dispositivo a "validado" (passo 6 do manual de integração). */
export const VALIDATION_CHECKLIST = [
  'O dispositivo NÃO está conectado à alta tensão nem ao chicote da moto (ou foi instalado por profissional com isolamento).',
  'Comparei as leituras com uma referência independente (ex.: termômetro, calibrador de pneu) e a diferença é aceitável.',
  'O dispositivo é somente leitura: não envia comandos à moto.',
  'Relógio/timestamps conferidos (UTC) e perdas de sequência aceitáveis.',
  'Cada canal está mapeado ao componente, grandeza e unidade corretos, com calibração registrada.',
] as const;
