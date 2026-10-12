import type { DataOrigin, TelemetrySample } from './types';

export const ORIGIN_LABEL: Record<DataOrigin, string> = {
  REAL: 'REAL',
  ESTIMADO: 'ESTIMADO',
  SIMULADO: 'SIMULADO',
  INDISPONIVEL: 'INDISPONÍVEL',
};

export const ORIGIN_DESCRIPTION: Record<DataOrigin, string> = {
  REAL: 'Obtido de interface/sensor comprovadamente conectado.',
  ESTIMADO: 'Derivado de fórmula documentada e entradas identificadas.',
  SIMULADO: 'Gerado pelo simulador — dado fictício de demonstração.',
  INDISPONIVEL: 'Não coletado, não validado ou sem sensor.',
};

/** Um valor pronto para exibição; quando INDISPONÍVEL, `value` é sempre null (nunca inventar número). */
export interface DisplayValue {
  value: number | null;
  unit: string;
  origin: DataOrigin;
  timestamp: number | null;
  stale: boolean;
  method?: string;
}

export const unavailable = (unit: string): DisplayValue => ({
  value: null,
  unit,
  origin: 'INDISPONIVEL',
  timestamp: null,
  stale: false,
});

export function isStale(sample: Pick<TelemetrySample, 'timestamp' | 'validForMs'>, now = Date.now()): boolean {
  return now - sample.timestamp > sample.validForMs;
}

export function fromSample(s: TelemetrySample | undefined, unit: string, now = Date.now()): DisplayValue {
  if (!s || s.quality === 'invalida') return unavailable(unit);
  return { value: s.value, unit: s.unit, origin: s.origin, timestamp: s.timestamp, stale: isStale(s, now) };
}

/** Garante que séries de origens diferentes não sejam misturadas. */
export function filterByOrigin<T extends { origin: DataOrigin }>(items: T[], origin: DataOrigin): T[] {
  return items.filter((x) => x.origin === origin);
}
