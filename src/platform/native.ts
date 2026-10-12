import { Capacitor } from '@capacitor/core';

/** true quando rodando dentro do APK (Capacitor), false no navegador. */
export const isNative = () => Capacitor.isNativePlatform();
export const platformName = () => Capacitor.getPlatform();

/** UUID BLE completo a partir de um identificador de 16 bits. */
export const uuid16 = (n: number) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

/** Normaliza UUID para minúsculas e 128 bits. */
export function normalizeUuid(u: string | number): string {
  if (typeof u === 'number') return uuid16(u);
  const s = u.toLowerCase().trim();
  if (/^[0-9a-f]{4}$/.test(s)) return uuid16(parseInt(s, 16));
  if (/^0x[0-9a-f]{4}$/.test(s)) return uuid16(parseInt(s.slice(2), 16));
  return s;
}
