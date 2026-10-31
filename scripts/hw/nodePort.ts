import { SerialPort } from 'serialport';
import type { FlashPort } from '../../src/platform/serial';

/** Porta serial do Node com a mesma forma da API Web Serial usada pelo app (FlashPort). Só para testes de bancada. */
export class NodePort implements FlashPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  private sp?: SerialPort;
  private dtr = true;
  private rts = true;

  constructor(private path: string) {}

  getInfo() {
    return { usbVendorId: 0x10c4, usbProductId: 0xea60 };
  }

  async open({ baudRate }: { baudRate: number }) {
    const sp = new SerialPort({ path: this.path, baudRate, autoOpen: false });
    await new Promise<void>((res, rej) => sp.open((e) => (e ? rej(e) : res())));
    this.sp = sp;
    this.readable = new ReadableStream<Uint8Array>({
      start(c) {
        sp.on('data', (d: Buffer) => {
          try {
            c.enqueue(new Uint8Array(d));
          } catch {
            // leitor cancelado
          }
        });
        sp.on('close', () => {
          try {
            c.close();
          } catch {
            // já fechado
          }
        });
      },
      cancel() {
        sp.removeAllListeners('data');
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) =>
        new Promise<void>((res, rej) => sp.write(Buffer.from(chunk), (e) => (e ? rej(e) : sp.drain(() => res())))),
    });
  }

  async close() {
    const sp = this.sp;
    this.readable = null;
    this.writable = null;
    if (sp?.isOpen) await new Promise<void>((r) => sp.close(() => r()));
  }

  async setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }) {
    // node-serialport aplica valores padrão aos sinais omitidos — sempre enviar os dois
    if (s.dataTerminalReady !== undefined) this.dtr = s.dataTerminalReady;
    if (s.requestToSend !== undefined) this.rts = s.requestToSend;
    await new Promise<void>((res, rej) => this.sp!.set({ dtr: this.dtr, rts: this.rts }, (e) => (e ? rej(e) : res())));
  }
}

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
