import { create } from 'zustand';
import { benchLog, benchMessage, emptyBench, type BenchState } from '../integrations/bench';
import type { DeviceStreamAdapter } from '../integrations/hardware/DeviceStreamAdapter';
import { live } from './liveLog';

/** Estado da bateria de testes do gateway nesta sessão (zera ao recarregar ou em “Recomeçar”). */
export const useBench = create<{ bench: BenchState; reset(): void }>((set) => ({
  bench: emptyBench(),
  reset: () => set({ bench: emptyBench() }),
}));

export function attachBench(adapters: DeviceStreamAdapter[]) {
  for (const a of adapters) {
    a.onMessage((m, transport, at) => {
      live('msg', `${transport} ${m.dev} #${m.seq} ${JSON.stringify(m.ch)} st=${JSON.stringify(m.st ?? {})}`);
      useBench.setState((s) => ({ bench: benchMessage(s.bench, m, transport, at) }));
    });
    a.onFirmwareLine((line, fw, advice) => {
      live('placa', line);
      useBench.setState((s) => ({ bench: benchLog(s.bench, line, fw, advice) }));
    });
  }
}
