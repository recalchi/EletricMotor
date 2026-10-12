/**
 * Estimativas com metodologia documentada. Todo resultado é ESTIMADO e cita suas entradas.
 */

export interface Estimate {
  value: number | null;
  unit: string;
  method: string;
  inputs: Record<string, string>;
}

/** Energia nominal (kWh) = V nominal × Ah nominal / 1000. */
export function nominalEnergyKWh(voltageV: number | null, capacityAh: number | null): Estimate {
  const inputs = { tensão: fmt(voltageV, 'V'), capacidade: fmt(capacityAh, 'Ah') };
  if (voltageV == null || capacityAh == null) return { value: null, unit: 'kWh', method: 'V × Ah / 1000', inputs };
  return { value: round((voltageV * capacityAh) / 1000, 2), unit: 'kWh', method: 'V × Ah / 1000', inputs };
}

/** Energia disponível ≈ Σ (energia nominal × SOC). Não considera SOH (desconhecido). */
export function availableEnergyKWh(packs: { nominalKWh: number | null; socPercent: number | null }[]): Estimate {
  const valid = packs.filter((p) => p.nominalKWh != null && p.socPercent != null);
  const inputs = Object.fromEntries(
    packs.map((p, i) => [`bateria ${i + 1}`, `${fmt(p.nominalKWh, 'kWh')} × ${fmt(p.socPercent, '%')}`]),
  );
  if (!valid.length) return { value: null, unit: 'kWh', method: 'Σ (E nominal × SOC)', inputs };
  const v = valid.reduce((acc, p) => acc + (p.nominalKWh! * p.socPercent!) / 100, 0);
  return { value: round(v, 2), unit: 'kWh', method: 'Σ (E nominal × SOC); SOH assumido 100% (não medido)', inputs };
}

/** Autonomia ≈ energia disponível / consumo médio (Wh/km). Consumo deve vir de registros do proprietário. */
export function rangeKm(availableKWh: number | null, consumptionWhKm: number | null): Estimate {
  const inputs = { 'energia disponível': fmt(availableKWh, 'kWh'), consumo: fmt(consumptionWhKm, 'Wh/km') };
  if (availableKWh == null || !consumptionWhKm)
    return { value: null, unit: 'km', method: 'E disponível / consumo médio', inputs };
  return {
    value: Math.round((availableKWh * 1000) / consumptionWhKm),
    unit: 'km',
    method: 'E disponível / consumo médio',
    inputs,
  };
}

/** Consumo médio (Wh/km) a partir de sessões de carga e km rodados. */
export function consumptionWhKm(energyKWh: number, distanceKm: number): number | null {
  if (distanceKm <= 0 || energyKWh <= 0) return null;
  return round((energyKWh * 1000) / distanceKm, 1);
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
function fmt(v: number | null, u: string) {
  return v == null ? 'desconhecido' : `${v} ${u}`;
}
