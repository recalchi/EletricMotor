import { create } from 'zustand';
import { benchLog, benchMessage, emptyBench, type BenchState } from '../integrations/bench';
import type { DeviceStreamAdapter } from '../integrations/hardware/DeviceStreamAdapter';

/** Estado da bateria de testes do gateway nesta sessão (zera ao recarregar ou em “Recomeçar”). */
export const useBench = create<{ bench: BenchState; reset(): void }>((set) => ({
  bench: emptyBench(),
  reset: () => set({ bench: emptyBench() }),
}));

export function attachBench(adapters: DeviceStreamAdapter[]) {
  for (const a of adapters) {
    a.onMessage((m, transport, at) => useBench.setState((s) => ({ bench: benchMessage(s.bench, m, transport, at) })));
    a.onFirmwareLine((line, fw, advice) => useBench.setState((s) => ({ bench: benchLog(s.bench, line, fw, advice) })));
  }
}
