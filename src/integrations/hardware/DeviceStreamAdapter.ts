import type { DeviceProfile, DeviceTransport, TelemetrySample } from '../../domain/types';
import { capture, reportError, toHex } from '../../app/diagnostics';
import { BaseAdapter } from '../adapter';
import { mapMessage } from '../mapping';
import { LineBuffer, parseEmgpLine, seqGap, type EmgpMessage } from '../protocol';

/** Entrada do console de teste: tudo o que chega de dispositivos ainda não validados (ou com erro). */
export interface TestConsoleEntry {
  at: number;
  transport: DeviceTransport | 'manual';
  raw: string;
  dev?: string;
  error?: string;
  samples?: TelemetrySample[];
  unmapped?: string[];
  warnings?: string[];
  lost?: number;
}

export type DeviceResolver = (deviceId: string) => DeviceProfile | undefined;

/**
 * Base para fontes físicas que entregam EMGP (linhas JSON). Faz parsing, validação, detecção de perdas e
 * roteamento: dispositivo VALIDADO → telemetria REAL; demais → apenas console de teste.
 * Somente leitura: nenhuma subclasse escreve no dispositivo.
 */
export abstract class DeviceStreamAdapter extends BaseAdapter {
  abstract transport: DeviceTransport | 'manual';
  private lines = new LineBuffer();
  private lastSeq = new Map<string, number>();
  private testHandlers = new Set<(e: TestConsoleEntry) => void>();
  lostTotal = 0;

  constructor(
    protected resolveDevice: DeviceResolver,
    protected vehicleId: string,
  ) {
    super();
  }

  onTest(h: (e: TestConsoleEntry) => void) {
    this.testHandlers.add(h);
    return () => void this.testHandlers.delete(h);
  }
  protected test(e: TestConsoleEntry) {
    this.testHandlers.forEach((h) => h(e));
  }

  private decoder = new TextDecoder();

  /** Alimenta bytes brutos do transporte (registrados em hex quando a captura bruta está ativa). */
  protected feedBytes(bytes: Uint8Array) {
    capture({ src: this.id, kind: 'bruto', data: toHex(bytes), meta: { n: bytes.length } });
    this.feedText(this.decoder.decode(bytes, { stream: true }));
  }

  /** Alimenta texto bruto recebido do transporte. */
  protected feedText(chunk: string) {
    for (const line of this.lines.push(chunk)) {
      try {
        this.handleLine(line);
      } catch (e) {
        // uma mensagem problemática nunca interrompe o fluxo de recepção
        reportError(`adaptador:${this.id}`, e, { linha: line.slice(0, 200) });
      }
    }
  }

  protected handleLine(line: string, receivedAt = Date.now()) {
    capture({ src: this.id, kind: 'linha', data: line });
    if (line.trimStart().startsWith('#')) {
      // comentário/log do firmware — não é telemetria
      this.log('info', line.trim().slice(0, 200));
      return;
    }
    const r = parseEmgpLine(line, receivedAt);
    if (!r.ok) {
      capture({ src: this.id, kind: 'rejeitado', data: line, meta: { motivo: r.error } });
      this.test({ at: receivedAt, transport: this.transport, raw: line.slice(0, 300), error: r.error });
      return;
    }
    this.handleMessage(r.msg, line, receivedAt);
  }

  protected handleMessage(msg: EmgpMessage, raw: string, receivedAt = Date.now()) {
    const gap = seqGap(this.lastSeq.get(msg.dev) ?? null, msg.seq);
    this.lastSeq.set(msg.dev, msg.seq);
    if (gap.duplicate) return;
    if (gap.lost > 0) {
      this.lostTotal += gap.lost;
      this.log('warn', `${msg.dev}: ${gap.lost} mensagem(ns) perdida(s) (seq ${msg.seq})`);
    }
    if (gap.reset) this.log('info', `${msg.dev}: sequência reiniciada (dispositivo reiniciou?)`);

    const device = this.resolveDevice(msg.dev);
    if (!device) {
      capture({
        src: this.id,
        kind: 'mensagem',
        data: raw,
        meta: { dev: msg.dev, seq: msg.seq, origem: 'nao-cadastrado', st: msg.st },
      });
      this.test({
        at: receivedAt,
        transport: this.transport,
        raw,
        dev: msg.dev,
        error: 'dispositivo não cadastrado — cadastre-o em Conectividade → Dispositivos',
      });
      return;
    }
    const m = mapMessage(msg, device, this.vehicleId, receivedAt);
    capture({
      src: this.id,
      kind: 'mensagem',
      data: raw,
      meta: {
        dev: msg.dev,
        seq: msg.seq,
        origem: m.origin ?? 'teste',
        perdidas: gap.lost,
        naoMapeados: m.unmapped,
        avisos: m.warnings,
        st: msg.st,
      },
    });
    if (m.origin === 'REAL') {
      m.samples.forEach((s) => this.emit(s));
      if (m.warnings.length || m.unmapped.length)
        this.test({ at: receivedAt, transport: this.transport, raw, dev: msg.dev, ...m, lost: gap.lost });
    } else {
      this.test({ at: receivedAt, transport: this.transport, raw, dev: msg.dev, ...m, lost: gap.lost });
    }
  }

  protected setState(state: typeof this.st.state, message: string) {
    this.st.state = state;
    this.st.message = message;
  }
}

/**
 * Injeção manual de linhas EMGP (colar/digitar) — exercita o mesmo caminho de parsing, mapeamento e
 * validação sem hardware. Mensagens de dispositivos validados viram REAL; use só para testes.
 */
export class ManualEmgpAdapter extends DeviceStreamAdapter {
  id = 'manual-emgp';
  name = 'Injeção manual EMGP';
  kind = 'manual-import' as const;
  transport = 'manual' as const;
  description = 'Cole linhas EMGP para testar cadastro, mapeamento e console sem hardware.';
  async connect() {
    this.setState('conectado', 'Pronto para receber linhas');
  }
  async disconnect() {
    this.setState('desconectado', '');
  }
  inject(text: string) {
    text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .forEach((l) => this.handleLine(l));
  }
}
