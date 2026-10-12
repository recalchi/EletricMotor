import { create } from 'zustand';
import { capture, reportError, startCapture, useDiag } from '../../app/diagnostics';
import { bleExplorer } from '../../integrations/hardware/BleExplorer';
import { bondedBle, scanBle, type BleAdvert } from '../../platform/ble';
import { isNative } from '../../platform/native';
import { listUsbInventory, type UsbAnyDevice } from '../../platform/serial';
import { buildFindings, pickCandidates, type ExploreSummary, type Finding } from './classify';

/**
 * Scanner automático — SOMENTE RECEPÇÃO.
 * 1) dispositivos pareados  2) anúncios BLE (passivo)  3) exploração GATT dos candidatos (leitura/notificações)
 * 4) inventário USB  5) conclusões. Tudo vai para a captura, para análise e evolução do app.
 */
export const SCAN_MS = 15_000;
export const EXPLORE_MS = 20_000;

export type StepId = 'ambiente' | 'pareados' | 'ble' | 'explorar' | 'usb' | 'conclusao';
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'ambiente', label: 'Preparando e iniciando gravação' },
  { id: 'pareados', label: 'Bluetooth pareado' },
  { id: 'ble', label: 'Procurando sinais Bluetooth LE' },
  { id: 'explorar', label: 'Lendo os dispositivos promissores' },
  { id: 'usb', label: 'Verificando USB' },
  { id: 'conclusao', label: 'Conclusão' },
];

interface ScanState {
  running: boolean;
  step: StepId | null;
  stepDetail: string;
  startedAt: number | null;
  finishedAt: number | null;
  bonded: { id: string; name: string | null }[];
  adverts: BleAdvert[];
  explored: ExploreSummary[];
  usb: { devices: UsbAnyDevice[]; hostSupported: boolean } | null;
  findings: Finding[];
  error: string | null;
}

const initial: ScanState = {
  running: false,
  step: null,
  stepDetail: '',
  startedAt: null,
  finishedAt: null,
  bonded: [],
  adverts: [],
  explored: [],
  usb: null,
  findings: [],
  error: null,
};

export const useScan = create<ScanState>(() => initial);
const set = (p: Partial<ScanState>) => useScan.setState(p);

let abort: AbortController | null = null;

export function cancelScan() {
  abort?.abort();
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      res();
    });
  });

function summarize(id: string, name: string, ok: boolean, error?: string): ExploreSummary {
  const svcs = bleExplorer.state.services;
  const chars = svcs.flatMap((s) => s.chars);
  return {
    id,
    name,
    ok,
    error,
    services: svcs.length,
    chars: chars.length,
    readable: chars.filter((c) => c.props.includes('read')).length,
    notifying: chars.filter((c) => c.props.includes('notify') || c.props.includes('indicate')).length,
    notifications: chars.reduce((n, c) => n + c.notifications, 0),
    standard: svcs.filter((s) => !/não identificado/i.test(s.name)).map((s) => s.name),
  };
}

export async function runAutoScan() {
  if (useScan.getState().running) return;
  abort = new AbortController();
  const signal = abort.signal;
  set({ ...initial, running: true, startedAt: Date.now() });
  const native = isNative();
  const step = (s: StepId, d = '') => {
    set({ step: s, stepDetail: d });
    capture({ src: 'scanner', kind: 'evento', data: `etapa ${s}`, meta: d || undefined });
  };

  try {
    step('ambiente', native ? 'App Android' : 'Navegador');
    if (!useDiag.getState().capturing) startCapture(true);

    if (native) {
      step('pareados');
      const bonded = await bondedBle().catch((e) => {
        reportError('scanner', e);
        return [];
      });
      set({ bonded });
      capture({ src: 'scanner', kind: 'gatt', data: 'pareados', meta: bonded });

      if (!signal.aborted) {
        step('ble', `Escutando por ${SCAN_MS / 1000} s — mantenha a moto ligada e perto`);
        const adverts = await scanBle(SCAN_MS, (all) => set({ adverts: all }), signal);
        set({ adverts });
        capture({ src: 'scanner', kind: 'gatt', data: 'anúncios BLE', meta: adverts });
      }

      const cands = pickCandidates(useScan.getState().adverts);
      const explored: ExploreSummary[] = [];
      for (const c of cands) {
        if (signal.aborted) break;
        const name = c.name ?? c.id;
        step('explorar', `${name}: lendo serviços e aguardando dados (${EXPLORE_MS / 1000} s)`);
        const ok = await bleExplorer.exploreDevice(c.id, name, true);
        if (ok) await wait(EXPLORE_MS, signal);
        explored.push(summarize(c.id, name, ok, ok ? undefined : bleExplorer.state.message));
        set({ explored: [...explored] });
        await bleExplorer.stop();
      }

      if (!signal.aborted) {
        step('usb');
        const usb = await listUsbInventory().catch((e) => {
          reportError('scanner', e);
          return null;
        });
        set({ usb });
        capture({ src: 'scanner', kind: 'gatt', data: 'inventário USB', meta: usb });
      }
    }

    step('conclusao');
    const s = useScan.getState();
    const findings = buildFindings({
      native,
      bonded: s.bonded,
      adverts: s.adverts,
      explored: s.explored,
      usb: s.usb,
    });
    if (signal.aborted) findings.unshift({ level: 'alerta', title: 'Varredura interrompida', detail: '' });
    set({ findings });
    capture({ src: 'scanner', kind: 'evento', data: 'conclusões', meta: findings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ error: msg });
    reportError('scanner', e);
  } finally {
    set({ running: false, finishedAt: Date.now() });
    abort = null;
  }
}

/** Mantém um dispositivo conectado, recebendo notificações (gravadas na captura). */
export function monitorDevice(id: string, name: string) {
  if (!useDiag.getState().capturing) startCapture(true);
  return bleExplorer.exploreDevice(id, name, true);
}
