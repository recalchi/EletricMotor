import { useEffect, useState } from 'react';
import { CATALOG } from '../domain/catalog';
import { coverageSummary, effectiveCoverage } from '../domain/coverage';
import { fromSample, isStale, unavailable, type DisplayValue } from '../domain/origin';
import type { Quantity } from '../domain/types';
import { CloudLiveAdapter } from '../integrations/CloudLiveAdapter';
import { GatewayAdapter } from '../integrations/GatewayAdapter';
import { BleEssAdapter, BleNusAdapter } from '../integrations/hardware/BleAdapters';
import { ManualEmgpAdapter, type DeviceStreamAdapter } from '../integrations/hardware/DeviceStreamAdapter';
import { SerialAdapter } from '../integrations/hardware/SerialAdapter';
import { SimulatorAdapter } from '../integrations/simulator/SimulatorAdapter';
import type { TelemetryAdapter } from '../integrations/adapter';
import { sampleKey, useApp } from './store';

const VEHICLE = 'evs-1';
/** Cadastro de dispositivos consultado de forma síncrona pelos adaptadores físicos. */
const resolveDevice = (id: string) => useApp.getState().devices.find((d) => d.id === id);

/** Registro único de adaptadores (singleton da aplicação). */
export const simulator = new SimulatorAdapter(VEHICLE);
export const serial = new SerialAdapter(resolveDevice, VEHICLE);
export const bleNus = new BleNusAdapter(resolveDevice, VEHICLE);
export const bleEss = new BleEssAdapter(resolveDevice, VEHICLE);
export const manualEmgp = new ManualEmgpAdapter(resolveDevice, VEHICLE);
export const cloud = new CloudLiveAdapter();
export const gateway = new GatewayAdapter();
export const HARDWARE: DeviceStreamAdapter[] = [serial, bleNus, bleEss, manualEmgp];
export const ADAPTERS: TelemetryAdapter[] = [simulator, serial, bleNus, bleEss, cloud, manualEmgp, gateway];

let wired = false;
export function wireAdapters() {
  if (wired) return;
  wired = true;
  const st = useApp.getState();
  for (const a of ADAPTERS) {
    a.subscribe((s) => useApp.getState().ingest(s));
    a.onLog((e) => st.pushLog(a.name, e));
  }
  simulator.onEvent((e) => useApp.getState().pushSimEvent(e));
  for (const h of HARDWARE) h.onTest((e) => useApp.getState().pushTest(e));
}

export async function startSimulation() {
  simulator.batteryCount = useApp.getState().vehicle.batteryCount;
  await simulator.connect();
  useApp.getState().setSimRunning(true);
}
export async function stopSimulation() {
  await simulator.disconnect();
  useApp.getState().setSimRunning(false);
}

/** Força re-render periódico para atualizar "desatualizado" mesmo sem novas amostras. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Valor de exibição de uma grandeza. Prioridade: REAL > SIMULADO (somente com simulação ativa ou dados
 * ainda em memória). Sem amostra → INDISPONÍVEL (nunca inventa número).
 */
export function useReading(componentId: string, quantity: Quantity, unit: string): DisplayValue {
  const key = sampleKey(componentId, quantity);
  const real = useApp((s) => s.latest.REAL[key]);
  const sim = useApp((s) => s.latest.SIMULADO[key]);
  const now = useNow();
  if (real) return fromSample(real, unit, now);
  if (sim) return fromSample(sim, unit, now);
  return unavailable(unit);
}

export function useSeries(componentId: string, quantity: Quantity) {
  const key = sampleKey(componentId, quantity);
  const real = useApp((s) => s.history.REAL[key]);
  const sim = useApp((s) => s.history.SIMULADO[key]);
  if (real?.length) return { origin: 'REAL' as const, data: real };
  if (sim?.length) return { origin: 'SIMULADO' as const, data: sim };
  return { origin: 'INDISPONIVEL' as const, data: [] as { t: number; v: number }[] };
}

export function useConnectionStatus(): { label: string; tone: 'ok' | 'sim' | 'off' } {
  const simRunning = useApp((s) => s.simRunning);
  const hasReal = useApp((s) => Object.keys(s.latest.REAL).length > 0);
  if (hasReal) return { label: 'Online (REAL)', tone: 'ok' };
  if (simRunning) return { label: 'MODO SIMULAÇÃO', tone: 'sim' };
  return { label: 'Offline — sem fonte conectada', tone: 'off' };
}

/** Componentes com leitura REAL ainda válida (não desatualizada). */
export function useRealComponents(): Set<string> {
  const real = useApp((s) => s.latest.REAL);
  const now = useNow(5000);
  return new Set(
    Object.values(real)
      .filter((x) => !isStale(x, now))
      .map((x) => x.componentId),
  );
}

/** Cobertura efetiva: o catálogo + componentes que hoje recebem dado REAL de dispositivo validado. */
export function useEffectiveCoverage() {
  const realSet = useRealComponents();
  const items = CATALOG.map((c) => ({ ...c, coverage: effectiveCoverage(c, realSet) }));
  return { summary: coverageSummary(items), items };
}
