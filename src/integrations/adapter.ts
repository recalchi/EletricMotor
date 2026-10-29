import type { TelemetrySample } from '../domain/types';
import { capture, reportError } from '../app/diagnostics';
import type { FirmwareAnnounce, UpdateAdvice } from './firmware';

export type AdapterState = 'desconectado' | 'conectando' | 'conectado' | 'erro' | 'nao_implementado';

export interface AdapterStatus {
  state: AdapterState;
  message: string;
  lastSampleAt: number | null;
  samplesReceived: number;
  version: string;
  /** Firmware anunciado pelo gateway (linha "# fw ..."), quando houver. */
  firmware?: FirmwareAnnounce;
  firmwareAdvice?: UpdateAdvice;
}

export interface AdapterLogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Contrato de entrada de dados. O domínio e a UI só conhecem esta interface,
 * então trocar simulador por gateway real não exige mudanças no front-end.
 * Adaptadores são SOMENTE LEITURA: não existe método de escrita/comando para a moto.
 */
export interface TelemetryAdapter {
  id: string;
  name: string;
  kind: 'simulator' | 'gateway' | 'manual-import';
  description: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): AdapterStatus;
  subscribe(handler: (sample: TelemetrySample) => void): () => void;
  onLog(handler: (entry: AdapterLogEntry) => void): () => void;
}

/** Utilitário base com pub/sub e log. */
export abstract class BaseAdapter implements TelemetryAdapter {
  abstract id: string;
  abstract name: string;
  abstract kind: TelemetryAdapter['kind'];
  abstract description: string;
  protected st: AdapterStatus = {
    state: 'desconectado',
    message: '',
    lastSampleAt: null,
    samplesReceived: 0,
    version: '0.1.0',
  };
  private handlers = new Set<(s: TelemetrySample) => void>();
  private logHandlers = new Set<(e: AdapterLogEntry) => void>();

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  status() {
    return { ...this.st };
  }
  subscribe(h: (s: TelemetrySample) => void) {
    this.handlers.add(h);
    return () => void this.handlers.delete(h);
  }
  onLog(h: (e: AdapterLogEntry) => void) {
    this.logHandlers.add(h);
    return () => void this.logHandlers.delete(h);
  }
  protected emit(s: TelemetrySample) {
    this.st.lastSampleAt = s.timestamp;
    this.st.samplesReceived++;
    this.handlers.forEach((h) => h(s));
  }
  protected log(level: AdapterLogEntry['level'], message: string) {
    const e = { at: Date.now(), level, message };
    capture({ src: this.id, kind: level === 'error' ? 'erro' : 'evento', data: message });
    if (level === 'error') reportError(`adaptador:${this.id}`, message, undefined, 'erro');
    this.logHandlers.forEach((h) => h(e));
  }
}
