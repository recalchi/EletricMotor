import { uuid16 } from './native';

/**
 * Nomes de serviços/características BLE padronizados pelo Bluetooth SIG (Assigned Numbers), usados apenas
 * para exibição. UUIDs desconhecidos aparecem como "não identificado" — nunca adivinhar significado.
 */
const SERVICES: Record<number, string> = {
  0x1800: 'Generic Access',
  0x1801: 'Generic Attribute',
  0x1805: 'Current Time',
  0x180a: 'Device Information',
  0x180f: 'Battery Service',
  0x1816: 'Cycling Speed and Cadence',
  0x1818: 'Cycling Power',
  0x1819: 'Location and Navigation',
  0x181a: 'Environmental Sensing',
  0x181c: 'User Data',
  0x1826: 'Fitness Machine',
};

const CHARS: Record<number, string> = {
  0x2a00: 'Device Name',
  0x2a01: 'Appearance',
  0x2a04: 'Peripheral Preferred Connection Parameters',
  0x2a05: 'Service Changed',
  0x2a19: 'Battery Level',
  0x2a23: 'System ID',
  0x2a24: 'Model Number String',
  0x2a25: 'Serial Number String',
  0x2a26: 'Firmware Revision String',
  0x2a27: 'Hardware Revision String',
  0x2a28: 'Software Revision String',
  0x2a29: 'Manufacturer Name String',
  0x2a2b: 'Current Time',
  0x2a5b: 'CSC Measurement',
  0x2a63: 'Cycling Power Measurement',
  0x2a67: 'Location and Speed',
  0x2a6d: 'Pressure',
  0x2a6e: 'Temperature',
  0x2a6f: 'Humidity',
};

/** Serviços solicitados ao navegador na exploração (Web Bluetooth exige declarar antes). */
export const WEB_EXPLORE_SERVICES = [
  ...Object.keys(SERVICES).map((k) => uuid16(Number(k))),
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  uuid16(0xffe0), // módulos UART genéricos (HM-10 e similares)
  uuid16(0xfff0),
  uuid16(0xfee0),
];

const VENDOR: Record<string, string> = {
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART Service',
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART RX',
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART TX',
};

function short(u: string): number | null {
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(u.toLowerCase());
  return m ? parseInt(m[1], 16) : null;
}

export function serviceName(u: string) {
  const s = short(u);
  return VENDOR[u.toLowerCase()] ?? (s != null ? SERVICES[s] : undefined) ?? 'não identificado';
}
export function charName(u: string) {
  const s = short(u);
  return VENDOR[u.toLowerCase()] ?? (s != null ? CHARS[s] : undefined) ?? 'não identificado';
}

/** Decodificação SOMENTE para formatos padronizados conhecidos; demais ficam em hex/texto. */
export function decodeKnown(charUuid: string, v: DataView): string | null {
  const s = short(charUuid);
  try {
    switch (s) {
      case 0x2a19:
        return `${v.getUint8(0)} %`;
      case 0x2a6e:
        return `${(v.getInt16(0, true) / 100).toFixed(2)} °C`;
      case 0x2a6f:
        return `${(v.getUint16(0, true) / 100).toFixed(2)} %`;
      case 0x2a6d:
        return `${(v.getUint32(0, true) / 10).toFixed(1)} Pa`;
      case 0x2a00:
      case 0x2a24:
      case 0x2a25:
      case 0x2a26:
      case 0x2a27:
      case 0x2a28:
      case 0x2a29:
        return new TextDecoder().decode(v);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Tenta exibir bytes como texto se forem ASCII imprimível. */
export function asciiPreview(v: DataView): string | null {
  const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (!u8.length) return null;
  let printable = 0;
  for (const b of u8) if ((b >= 32 && b < 127) || b === 10 || b === 13) printable++;
  return printable / u8.length > 0.9 ? new TextDecoder().decode(u8).replace(/[\r\n]+/g, '⏎') : null;
}
