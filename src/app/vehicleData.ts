import { useDoc } from '../data/hooks';
import type { DisplayValue } from '../domain/origin';
import { availableEnergyKWh, nominalEnergyKWh, rangeKm } from '../domain/estimates';
import type { BatteryProfile, DataOrigin } from '../domain/types';
import { useApp } from './store';
import { useReading } from './telemetry';

export interface VehicleSettings {
  consumptionWhKm: number | null;
  consumptionSource: string;
}

export const DEFAULT_BATTERIES: { a: BatteryProfile; b: BatteryProfile } = {
  a: {
    id: 'battery-a',
    installed: true,
    serial: '',
    labelVoltageV: 72,
    labelCapacityAh: 33.6,
    labelVerified: false,
    notes: 'Valores da especificação — confirmar etiqueta.',
  },
  b: {
    id: 'battery-b',
    installed: true,
    serial: '',
    labelVoltageV: 72,
    labelCapacityAh: 33.6,
    labelVerified: false,
    notes: 'Valores da especificação — confirmar etiqueta.',
  },
};

export const DEFAULT_SETTINGS: VehicleSettings = { consumptionWhKm: null, consumptionSource: '' };

export function useBatteries() {
  return useDoc('batteries', DEFAULT_BATTERIES);
}
export function useVehicleSettings() {
  return useDoc('settings', DEFAULT_SETTINGS);
}

/** Origem resultante de uma estimativa: herda SIMULADO se qualquer entrada for simulada. */
export function combineOrigin(origins: DataOrigin[]): DataOrigin {
  if (origins.includes('INDISPONIVEL')) return 'INDISPONIVEL';
  if (origins.includes('SIMULADO')) return 'SIMULADO';
  return 'ESTIMADO';
}

/** Autonomia e energia disponíveis, com metodologia e origem explícitas. */
export function useRangeEstimate() {
  const { value: bats } = useBatteries();
  const { value: settings } = useVehicleSettings();
  const batteryCount = useApp((s) => s.vehicle.batteryCount);
  const socA = useReading('battery-a', 'soc', '%');
  const socB = useReading('battery-b', 'soc', '%');
  const packs = [{ p: bats.a, soc: socA }, ...(batteryCount === 2 ? [{ p: bats.b, soc: socB }] : [])];

  const energy = availableEnergyKWh(
    packs.map(({ p, soc }) => ({
      nominalKWh: nominalEnergyKWh(p.labelVoltageV, p.labelCapacityAh).value,
      socPercent: soc.value,
    })),
  );
  const range = rangeKm(energy.value, settings.consumptionWhKm);
  const energyOrigin = combineOrigin(packs.map((x) => (x.soc.value == null ? 'INDISPONIVEL' : x.soc.origin)));
  const rangeOrigin = settings.consumptionWhKm ? energyOrigin : 'INDISPONIVEL';

  const energyDv: DisplayValue = {
    value: energyOrigin === 'INDISPONIVEL' ? null : energy.value,
    unit: 'kWh',
    origin: energyOrigin,
    timestamp: socA.timestamp,
    stale: packs.some((x) => x.soc.stale),
    method: energy.method,
  };
  const rangeDv: DisplayValue = {
    value: rangeOrigin === 'INDISPONIVEL' ? null : range.value,
    unit: 'km',
    origin: rangeOrigin,
    timestamp: socA.timestamp,
    stale: energyDv.stale,
    method: range.method,
  };
  return { energy: energyDv, range: rangeDv, energyEstimate: energy, rangeEstimate: range, settings };
}
