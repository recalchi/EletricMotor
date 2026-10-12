import { BleClient, type BleService } from '@capacitor-community/bluetooth-le';
import { isNative, normalizeUuid } from './native';

/**
 * Enlace BLE somente-leitura, com implementação para navegador (Web Bluetooth) e para o APK
 * (plugin nativo). Não há operação de escrita: nada é enviado ao dispositivo além do protocolo
 * de conexão/assinatura exigido pelo próprio BLE.
 */
export interface GattCharInfo {
  uuid: string;
  properties: { read: boolean; write: boolean; writeWithoutResponse: boolean; notify: boolean; indicate: boolean };
}
export interface GattServiceInfo {
  uuid: string;
  characteristics: GattCharInfo[];
}

export interface BleLink {
  readonly id: string;
  readonly name: string;
  services(): Promise<GattServiceInfo[]>;
  read(service: string, characteristic: string): Promise<DataView>;
  subscribe(service: string, characteristic: string, cb: (v: DataView) => void): Promise<() => Promise<void>>;
  onDisconnect(cb: () => void): void;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface BleRequest {
  /** Filtra por serviços anunciados. */
  services?: string[];
  /** Serviços que poderão ser acessados (Web Bluetooth exige declarar). */
  optionalServices?: string[];
  /** Mostrar todos os dispositivos próximos (exploração). */
  acceptAll?: boolean;
  namePrefix?: string;
}

export function bleSupported(): boolean {
  if (isNative()) return true;
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export async function requestBle(req: BleRequest): Promise<BleLink> {
  return isNative() ? requestNative(req) : requestWeb(req);
}

// ───────────────────────── Navegador

async function requestWeb(req: BleRequest): Promise<BleLink> {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth indisponível neste navegador');
  const optional = (req.optionalServices ?? []).map(normalizeUuid);
  const device = await navigator.bluetooth.requestDevice(
    req.acceptAll || !req.services?.length
      ? { acceptAllDevices: true, optionalServices: [...optional, ...(req.services ?? []).map(normalizeUuid)] }
      : {
          filters: [
            { services: req.services.map(normalizeUuid), ...(req.namePrefix ? { namePrefix: req.namePrefix } : {}) },
          ],
          optionalServices: optional,
        },
  );
  let server = await device.gatt!.connect();
  const disconnectCbs: (() => void)[] = [];
  device.addEventListener('gattserverdisconnected', () => disconnectCbs.forEach((c) => c()));
  const chr = async (s: string, c: string) =>
    (await server.getPrimaryService(normalizeUuid(s))).getCharacteristic(normalizeUuid(c));

  return {
    id: device.id,
    name: device.name ?? device.id,
    async services() {
      const svcs = await server.getPrimaryServices();
      const out: GattServiceInfo[] = [];
      for (const s of svcs) {
        const chars = await s.getCharacteristics().catch(() => []);
        out.push({
          uuid: s.uuid,
          characteristics: chars.map((c) => ({
            uuid: c.uuid,
            properties: {
              read: c.properties.read,
              write: !!c.properties.write,
              writeWithoutResponse: !!c.properties.writeWithoutResponse,
              notify: c.properties.notify,
              indicate: !!c.properties.indicate,
            },
          })),
        });
      }
      return out;
    },
    async read(s, c) {
      return (await chr(s, c)).readValue();
    },
    async subscribe(s, c, cb) {
      const ch = await chr(s, c);
      const handler = (ev: Event) => {
        const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) cb(v);
      };
      ch.addEventListener('characteristicvaluechanged', handler);
      await ch.startNotifications();
      return async () => {
        ch.removeEventListener('characteristicvaluechanged', handler);
        await ch.stopNotifications().catch(() => undefined);
      };
    },
    onDisconnect(cb) {
      disconnectCbs.push(cb);
    },
    async reconnect() {
      server = await device.gatt!.connect();
    },
    async disconnect() {
      device.gatt?.disconnect();
    },
  };
}

// ───────────────────────── APK (plugin @capacitor-community/bluetooth-le)

let initialized = false;
async function ensureInit() {
  if (initialized) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  initialized = true;
}

async function requestNative(req: BleRequest): Promise<BleLink> {
  await ensureInit();
  if (!(await BleClient.isEnabled())) {
    await BleClient.requestEnable().catch(() => undefined);
    if (!(await BleClient.isEnabled())) throw new Error('Bluetooth desligado — ative o Bluetooth do celular');
  }
  const device = await BleClient.requestDevice(
    req.acceptAll || !req.services?.length
      ? { optionalServices: req.optionalServices?.map(normalizeUuid) }
      : {
          services: req.services.map(normalizeUuid),
          optionalServices: req.optionalServices?.map(normalizeUuid),
          namePrefix: req.namePrefix,
        },
  );
  return nativeLink(device.deviceId, device.name ?? device.deviceId);
}

async function nativeLink(deviceId: string, name: string): Promise<BleLink> {
  const device = { deviceId };
  const disconnectCbs: (() => void)[] = [];
  const onDisc = () => disconnectCbs.forEach((c) => c());
  await BleClient.connect(device.deviceId, onDisc, { timeout: 15000 });

  return {
    id: device.deviceId,
    name,
    async services() {
      const svcs: BleService[] = await BleClient.getServices(device.deviceId);
      return svcs.map((s) => ({
        uuid: s.uuid,
        characteristics: s.characteristics.map((c) => ({
          uuid: c.uuid,
          properties: {
            read: !!c.properties.read,
            write: !!c.properties.write,
            writeWithoutResponse: !!c.properties.writeWithoutResponse,
            notify: !!c.properties.notify,
            indicate: !!c.properties.indicate,
          },
        })),
      }));
    },
    read(s, c) {
      return BleClient.read(device.deviceId, normalizeUuid(s), normalizeUuid(c));
    },
    async subscribe(s, c, cb) {
      await BleClient.startNotifications(device.deviceId, normalizeUuid(s), normalizeUuid(c), cb);
      return () =>
        BleClient.stopNotifications(device.deviceId, normalizeUuid(s), normalizeUuid(c)).catch(() => undefined);
    },
    onDisconnect(cb) {
      disconnectCbs.push(cb);
    },
    async reconnect() {
      await BleClient.connect(device.deviceId, onDisc, { timeout: 15000 });
    },
    async disconnect() {
      await BleClient.disconnect(device.deviceId).catch(() => undefined);
    },
  };
}

// ───────────────────────── Varredura automática (somente APK)

export interface BleAdvert {
  id: string;
  name: string | null;
  rssi: number | null;
  txPower: number | null;
  uuids: string[];
  /** id do fabricante (Bluetooth SIG, decimal) → bytes em hex */
  manufacturer: Record<string, string>;
  serviceData: Record<string, string>;
  raw: string | null;
  seen: number;
}

const hexOf = (v?: DataView) =>
  v
    ? Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), (b) => b.toString(16).padStart(2, '0')).join(' ')
    : '';

async function ensureEnabled() {
  await ensureInit();
  if (!(await BleClient.isEnabled())) {
    await BleClient.requestEnable().catch(() => undefined);
    if (!(await BleClient.isEnabled())) throw new Error('Bluetooth desligado — ative o Bluetooth do celular');
  }
}

/**
 * Escuta anúncios BLE por `ms` milissegundos sem conectar em nada (recepção passiva).
 * Chama `onUpdate` a cada anúncio; devolve a lista final.
 */
export async function scanBle(ms: number, onUpdate?: (all: BleAdvert[]) => void, signal?: AbortSignal) {
  if (!isNative()) throw new Error('Varredura automática disponível apenas no app Android');
  await ensureEnabled();
  const found = new Map<string, BleAdvert>();
  await BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
    const prev = found.get(r.device.deviceId);
    const manufacturer: Record<string, string> = { ...(prev?.manufacturer ?? {}) };
    for (const [k, v] of Object.entries(r.manufacturerData ?? {})) manufacturer[k] = hexOf(v);
    const serviceData: Record<string, string> = { ...(prev?.serviceData ?? {}) };
    for (const [k, v] of Object.entries(r.serviceData ?? {})) serviceData[k] = hexOf(v);
    found.set(r.device.deviceId, {
      id: r.device.deviceId,
      name: r.localName ?? r.device.name ?? prev?.name ?? null,
      rssi: r.rssi ?? prev?.rssi ?? null,
      txPower: r.txPower ?? prev?.txPower ?? null,
      uuids: [...new Set([...(prev?.uuids ?? []), ...(r.uuids ?? [])])],
      manufacturer,
      serviceData,
      raw: r.rawAdvertisement ? hexOf(r.rawAdvertisement) : (prev?.raw ?? null),
      seen: (prev?.seen ?? 0) + 1,
    });
    onUpdate?.([...found.values()]);
  });
  await new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      res();
    });
  });
  await BleClient.stopLEScan().catch(() => undefined);
  return [...found.values()];
}

/** Dispositivos pareados no Android (inclui Bluetooth clássico, ex.: áudio do painel). */
export async function bondedBle(): Promise<{ id: string; name: string | null }[]> {
  if (!isNative()) return [];
  await ensureEnabled();
  const list = await BleClient.getBondedDevices();
  return list.map((d) => ({ id: d.deviceId, name: d.name ?? null }));
}

/** Conecta (somente leitura) a um dispositivo encontrado na varredura. */
export async function connectBleById(id: string, name: string): Promise<BleLink> {
  if (!isNative()) throw new Error('Conexão direta disponível apenas no app Android');
  await ensureEnabled();
  return nativeLink(id, name);
}
