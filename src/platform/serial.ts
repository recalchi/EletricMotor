import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from './native';

/**
 * Enlace serial somente-leitura: Web Serial no navegador; no APK, plugin nativo "UsbSerial"
 * (android/app/src/main/java/.../UsbSerialPlugin.java, baseado em usb-serial-for-android) com USB OTG.
 * A escrita (write/setSignals) existe só para a gravação de firmware — ver requestFlashPort().
 */
export interface SerialLink {
  readonly label: string;
  onData(cb: (bytes: Uint8Array) => void): void;
  onError(cb: (err: Error) => void): void;
  close(): Promise<void>;
}

export function serialSupported(): boolean {
  if (isNative()) return true;
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** grantedOnly: só reconecta a uma porta já autorizada (sem seletor) — usado na conexão automática ao abrir. */
export async function openSerial(baudRate: number, opts: { grantedOnly?: boolean } = {}): Promise<SerialLink> {
  return isNative() ? openNative(baudRate) : openWeb(baudRate, opts.grantedOnly);
}

// ───────────────────────── Navegador

async function openWeb(baudRate: number, grantedOnly = false): Promise<SerialLink> {
  if (!navigator.serial) throw new Error('Web Serial indisponível — use Chrome ou Edge no computador');
  // Porta já autorizada antes (uma só): reconecta sem abrir o seletor
  const granted = (await navigator.serial.getPorts?.()) ?? [];
  if (grantedOnly && granted.length !== 1)
    throw new Error('Conexão automática: nenhuma porta USB autorizada ainda — toque em Conectar USB uma vez');
  const port = granted.length === 1 ? granted[0] : await navigator.serial.requestPort();
  try {
    await port.open({ baudRate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already open|Failed to open|Access denied/i.test(msg))
      throw new Error('Porta USB em uso por outro programa ou aba — feche-o (ou desconecte nele) e tente de novo');
    throw e;
  }
  const info = port.getInfo();
  const dataCbs: ((b: Uint8Array) => void)[] = [];
  const errCbs: ((e: Error) => void)[] = [];
  let closing = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  void (async () => {
    while (port.readable && !closing) {
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) dataCbs.forEach((c) => c(value));
        }
      } catch (e) {
        if (!closing) errCbs.forEach((c) => c(e instanceof Error ? e : new Error(String(e))));
        break;
      } finally {
        reader.releaseLock();
      }
    }
  })();

  return {
    label: `USB ${info.usbVendorId ? `VID ${info.usbVendorId.toString(16)} PID ${info.usbProductId?.toString(16)}` : ''} @ ${baudRate}`,
    onData: (cb) => void dataCbs.push(cb),
    onError: (cb) => void errCbs.push(cb),
    async close() {
      closing = true;
      await reader?.cancel().catch(() => undefined);
      await port.close().catch(() => undefined);
    },
  };
}

// ───────────────────────── APK

interface UsbDeviceInfo {
  deviceId: number;
  vendorId: number;
  productId: number;
  name: string;
  driver: string;
}
export interface UsbAnyDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
  deviceClass: number;
  manufacturer?: string | null;
  product?: string | null;
  interfaces: { class: number; subclass: number; protocol: number; endpoints: number }[];
  serialDriver: boolean;
  permission: boolean;
}
interface UsbSerialPlugin {
  listDevices(): Promise<{ devices: UsbDeviceInfo[] }>;
  listAllUsb(): Promise<{ devices: UsbAnyDevice[]; hostSupported: boolean }>;
  open(opts: { deviceId?: number; baudRate: number }): Promise<{ device: UsbDeviceInfo }>;
  close(): Promise<void>;
  /** Somente gravação de firmware (FlashPort). */
  write(opts: { base64: string }): Promise<void>;
  /** Somente gravação de firmware: DTR/RTS levam o ESP32 ao modo de gravação e o reiniciam. */
  setSignals(opts: { dtr?: boolean; rts?: boolean }): Promise<void>;
  addListener(event: 'data', cb: (d: { base64: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', cb: (d: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const UsbSerial = registerPlugin<UsbSerialPlugin>('UsbSerial');

/** Inventário USB (somente APK). No navegador retorna null. */
export async function listUsbInventory(): Promise<{ devices: UsbAnyDevice[]; hostSupported: boolean } | null> {
  if (!isNative()) return null;
  return UsbSerial.listAllUsb();
}

/** Nomes das classes USB padrão (usb.org) — só para exibição. */
export const USB_CLASS: Record<number, string> = {
  0x01: 'Áudio',
  0x02: 'Comunicação (CDC)',
  0x03: 'HID (teclado/controle)',
  0x07: 'Impressora',
  0x08: 'Armazenamento',
  0x09: 'Hub',
  0x0a: 'Dados CDC',
  0x0e: 'Vídeo',
  0xe0: 'Sem fio (Bluetooth/rádio)',
  0xff: 'Específica do fabricante',
};

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function openNative(baudRate: number): Promise<SerialLink> {
  const { devices } = await UsbSerial.listDevices();
  if (!devices.length) throw new Error('Nenhum dispositivo USB serial encontrado — conecte o gateway via cabo OTG');
  const { device } = await UsbSerial.open({ deviceId: devices[0].deviceId, baudRate });
  const dataCbs: ((b: Uint8Array) => void)[] = [];
  const errCbs: ((e: Error) => void)[] = [];
  const h1 = await UsbSerial.addListener('data', (d) => {
    const bytes = b64ToBytes(d.base64);
    dataCbs.forEach((c) => c(bytes));
  });
  const h2 = await UsbSerial.addListener('error', (d) => errCbs.forEach((c) => c(new Error(d.message))));
  return {
    label: `USB ${device.name} (${device.driver}, VID ${device.vendorId.toString(16)}) @ ${baudRate}`,
    onData: (cb) => void dataCbs.push(cb),
    onError: (cb) => void errCbs.push(cb),
    async close() {
      await h1.remove();
      await h2.remove();
      await UsbSerial.close().catch(() => undefined);
    },
  };
}

// ───────────────────────── Porta para gravação de firmware

/**
 * Subconjunto da API Web Serial (SerialPort) usado pelo esptool-js. No navegador é a própria porta; no APK, um
 * adaptador sobre o plugin nativo. Usado APENAS por integrations/flasher.ts.
 */
export interface FlashPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export function flashSupported(): boolean {
  return serialSupported();
}

/** Pede ao usuário a porta do gateway (seletor do navegador ou permissão USB do Android). */
export async function requestFlashPort(): Promise<FlashPort> {
  if (isNative()) {
    const { devices } = await UsbSerial.listDevices();
    if (!devices.length) throw new Error('Nenhum dispositivo USB serial encontrado — conecte o gateway via cabo OTG');
    return new NativeFlashPort(devices[0]);
  }
  if (!navigator.serial) throw new Error('Web Serial indisponível — use Chrome ou Edge no computador');
  return (await navigator.serial.requestPort()) as unknown as FlashPort;
}

const bytesToB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

class NativeFlashPort implements FlashPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  private handles: PluginListenerHandle[] = [];
  private dtr = true;
  private rts = true;

  constructor(private device: UsbDeviceInfo) {}

  getInfo() {
    return { usbVendorId: this.device.vendorId, usbProductId: this.device.productId };
  }

  async open({ baudRate }: { baudRate: number }) {
    await UsbSerial.open({ deviceId: this.device.deviceId, baudRate });
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        ctrl = c;
      },
    });
    this.handles.push(
      await UsbSerial.addListener('data', (d) => {
        try {
          ctrl.enqueue(b64ToBytes(d.base64));
        } catch {
          // leitor já cancelado
        }
      }),
      await UsbSerial.addListener('error', (d) => {
        try {
          ctrl.error(new Error(d.message));
        } catch {
          // fluxo já encerrado
        }
      }),
    );
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => UsbSerial.write({ base64: bytesToB64(chunk) }),
    });
  }

  async close() {
    await Promise.all(this.handles.map((h) => h.remove()));
    this.handles = [];
    this.readable = null;
    this.writable = null;
    await UsbSerial.close().catch(() => undefined);
  }

  async setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }) {
    if (s.dataTerminalReady !== undefined) this.dtr = s.dataTerminalReady;
    if (s.requestToSend !== undefined) this.rts = s.requestToSend;
    await UsbSerial.setSignals({ dtr: this.dtr, rts: this.rts });
  }
}
