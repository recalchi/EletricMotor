import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from './native';

/**
 * Enlace serial somente-leitura: Web Serial no navegador; no APK, plugin nativo "UsbSerial"
 * (android/app/src/main/java/.../UsbSerialPlugin.java, baseado em usb-serial-for-android) com USB OTG.
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

export async function openSerial(baudRate: number): Promise<SerialLink> {
  return isNative() ? openNative(baudRate) : openWeb(baudRate);
}

// ───────────────────────── Navegador

async function openWeb(baudRate: number): Promise<SerialLink> {
  if (!navigator.serial) throw new Error('Web Serial indisponível — use Chrome ou Edge no computador');
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
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
interface UsbSerialPlugin {
  listDevices(): Promise<{ devices: UsbDeviceInfo[] }>;
  open(opts: { deviceId?: number; baudRate: number }): Promise<{ device: UsbDeviceInfo }>;
  close(): Promise<void>;
  addListener(event: 'data', cb: (d: { base64: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', cb: (d: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const UsbSerial = registerPlugin<UsbSerialPlugin>('UsbSerial');

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
