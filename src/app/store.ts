import { create } from 'zustand';
import { DEFAULT_RULES, acknowledge, evaluate } from '../domain/alerts';
import type { Alert, AlertRule, DataOrigin, Quantity, TelemetrySample, VehicleProfile } from '../domain/types';
import type { AdapterLogEntry } from '../integrations/adapter';
import type { SimEvent } from '../integrations/simulator/engine';

export type ViewMode = 'externo' | 'eletrico' | 'mecanico' | 'sensores';

export const sampleKey = (componentId: string, quantity: Quantity) => `${componentId}:${quantity}`;

const HISTORY_MAX = 600; // pontos por série em memória (~5 min a 2 Hz)

interface AppState {
  // Seleção / 3D
  selectedId: string | null;
  hoveredId: string | null;
  viewMode: ViewMode;
  exploded: boolean;
  hideFairings: boolean;
  xray: boolean;
  isolateId: string | null;
  select(id: string | null): void;
  hover(id: string | null): void;
  setViewMode(m: ViewMode): void;
  toggle(k: 'exploded' | 'hideFairings' | 'xray'): void;
  isolate(id: string | null): void;

  // Preferências
  reducedMotion: boolean;
  setReducedMotion(v: boolean): void;

  // Veículo
  vehicle: VehicleProfile;
  setVehicle(v: Partial<VehicleProfile>): void;

  // Telemetria em memória — separada por origem (nunca mistura SIMULADO com REAL)
  latest: Record<DataOrigin, Record<string, TelemetrySample>>;
  history: Record<DataOrigin, Record<string, { t: number; v: number }[]>>;
  ingest(s: TelemetrySample): void;
  clearOrigin(o: DataOrigin): void;

  // Alertas
  rules: AlertRule[];
  alerts: Alert[];
  ackAlert(id: string): void;
  setRule(id: string, patch: Partial<AlertRule>): void;

  // Adaptadores / simulação
  simRunning: boolean;
  setSimRunning(v: boolean): void;
  adapterLog: (AdapterLogEntry & { adapter: string })[];
  pushLog(adapter: string, e: AdapterLogEntry): void;
  simEvents: SimEvent[];
  pushSimEvent(e: SimEvent): void;
}

const emptyByOrigin = <T>(): Record<DataOrigin, Record<string, T>> => ({
  REAL: {},
  ESTIMADO: {},
  SIMULADO: {},
  INDISPONIVEL: {},
});

const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useApp = create<AppState>((set) => ({
  selectedId: null,
  hoveredId: null,
  viewMode: 'externo',
  exploded: false,
  hideFairings: false,
  xray: false,
  isolateId: null,
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setViewMode: (m) => set({ viewMode: m, xray: m !== 'externo' }),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<AppState>),
  isolate: (id) => set({ isolateId: id }),

  reducedMotion: Boolean(prefersReduced),
  setReducedMotion: (v) => set({ reducedMotion: v }),

  vehicle: {
    id: 'evs-1',
    name: 'Minha Voltz EVS',
    model: 'Voltz EVS',
    year: null,
    variant: 'a confirmar',
    batteryCount: 2,
    odometerKm: 0,
    vinVerified: false,
  },
  setVehicle: (v) => set((s) => ({ vehicle: { ...s.vehicle, ...v } })),

  latest: emptyByOrigin<TelemetrySample>(),
  history: emptyByOrigin<{ t: number; v: number }[]>(),
  ingest: (smp) =>
    set((s) => {
      const k = sampleKey(smp.componentId, smp.quantity);
      const o = smp.origin;
      if (smp.quality === 'invalida') {
        // dado inválido não substitui o último válido; ele envelhece e vira "desatualizado"
        return {};
      }
      const series = s.history[o][k] ?? [];
      const nextSeries = series.length >= HISTORY_MAX ? series.slice(-HISTORY_MAX + 1) : series.slice();
      nextSeries.push({ t: smp.timestamp, v: smp.value });
      return {
        latest: { ...s.latest, [o]: { ...s.latest[o], [k]: smp } },
        history: { ...s.history, [o]: { ...s.history[o], [k]: nextSeries } },
        alerts: evaluate(smp, s.rules, s.alerts),
      };
    }),
  clearOrigin: (o) =>
    set((s) => ({
      latest: { ...s.latest, [o]: {} },
      history: { ...s.history, [o]: {} },
      alerts: s.alerts.filter((a) => a.origin !== o),
    })),

  rules: DEFAULT_RULES,
  alerts: [],
  ackAlert: (id) => set((s) => ({ alerts: acknowledge(s.alerts, id) })),
  setRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

  simRunning: false,
  setSimRunning: (v) => set({ simRunning: v }),
  adapterLog: [],
  pushLog: (adapter, e) => set((s) => ({ adapterLog: [{ ...e, adapter }, ...s.adapterLog].slice(0, 200) })),
  simEvents: [],
  pushSimEvent: (e) => set((s) => ({ simEvents: [e, ...s.simEvents].slice(0, 100) })),
}));
