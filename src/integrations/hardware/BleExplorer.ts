import { capture, reportError, toHex } from '../../app/diagnostics';
import { requestBle, type BleLink, type GattServiceInfo } from '../../platform/ble';
import { asciiPreview, charName, decodeKnown, serviceName, WEB_EXPLORE_SERVICES } from '../../platform/gattNames';
import { normalizeUuid } from '../../platform/native';

/**
 * Exploração completa e SOMENTE LEITURA de um dispositivo BLE (inclusive, se o proprietário quiser, o
 * Bluetooth do painel da moto): descobre serviços/características, lê as legíveis e assina notificações.
 * Nunca escreve em característica alguma. Tudo é registrado na captura para análise posterior.
 *
 * No navegador, só serviços declarados podem ser acessados (padrões conhecidos + UUIDs informados pelo usuário).
 * No APK, a descoberta é completa.
 */
export interface ExploredChar {
  service: string;
  uuid: string;
  name: string;
  props: string[];
  lastHex?: string;
  lastText?: string | null;
  decoded?: string | null;
  error?: string;
  notifications: number;
}

export interface ExplorerState {
  status: 'idle' | 'conectando' | 'explorando' | 'ativo' | 'erro' | 'desconectado';
  device?: string;
  message?: string;
  services: { uuid: string; name: string; chars: ExploredChar[] }[];
}

const READ_TIMEOUT_MS = 4000;
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), ms))]);

export class BleExplorer {
  private link: BleLink | null = null;
  private unsubs: (() => Promise<void>)[] = [];
  private listeners = new Set<(s: ExplorerState) => void>();
  state: ExplorerState = { status: 'idle', services: [] };

  onChange(cb: (s: ExplorerState) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private set(patch: Partial<ExplorerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }
  private updateChar(service: string, uuid: string, patch: Partial<ExploredChar>) {
    this.set({
      services: this.state.services.map((s) =>
        s.uuid !== service ? s : { ...s, chars: s.chars.map((c) => (c.uuid === uuid ? { ...c, ...patch } : c)) },
      ),
    });
  }

  async explore(extraServices: string[] = [], subscribe = true) {
    await this.stop();
    this.set({ status: 'conectando', services: [], message: 'Selecione o dispositivo…', device: undefined });
    try {
      const optional = [...WEB_EXPLORE_SERVICES, ...extraServices.map(normalizeUuid)];
      this.link = await requestBle({ acceptAll: true, optionalServices: optional });
      const link = this.link;
      link.onDisconnect(() => {
        this.set({ status: 'desconectado', message: 'Dispositivo desconectou' });
        capture({ src: 'ble-explorer', kind: 'evento', data: 'desconectado', meta: { device: link.name } });
      });
      this.set({ status: 'explorando', device: link.name, message: 'Descobrindo serviços…' });
      capture({ src: 'ble-explorer', kind: 'evento', data: 'conectado', meta: { device: link.name, id: link.id } });

      const services: GattServiceInfo[] = await link.services();
      capture({ src: 'ble-explorer', kind: 'gatt', data: 'mapa de serviços', meta: services });
      this.set({
        services: services.map((s) => ({
          uuid: s.uuid,
          name: serviceName(s.uuid),
          chars: s.characteristics.map((c) => ({
            service: s.uuid,
            uuid: c.uuid,
            name: charName(c.uuid),
            props: Object.entries(c.properties)
              .filter(([, v]) => v)
              .map(([k]) => k),
            notifications: 0,
          })),
        })),
      });

      // Leitura de todas as características legíveis
      for (const s of services) {
        for (const c of s.characteristics) {
          if (!c.properties.read) continue;
          try {
            const v = await withTimeout(link.read(s.uuid, c.uuid), READ_TIMEOUT_MS);
            this.record(s.uuid, c.uuid, v, 'leitura');
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.updateChar(s.uuid, c.uuid, { error: msg });
            capture({ src: 'ble-explorer', kind: 'erro', data: `leitura ${c.uuid}: ${msg}` });
          }
        }
      }

      // Assinatura de todas as notificações/indicações
      if (subscribe) {
        for (const s of services) {
          for (const c of s.characteristics) {
            if (!c.properties.notify && !c.properties.indicate) continue;
            try {
              const un = await withTimeout(
                link.subscribe(s.uuid, c.uuid, (v) => this.record(s.uuid, c.uuid, v, 'notificacao')),
                READ_TIMEOUT_MS,
              );
              this.unsubs.push(un);
            } catch (e) {
              this.updateChar(s.uuid, c.uuid, { error: `notificação: ${e instanceof Error ? e.message : String(e)}` });
            }
          }
        }
      }
      const total = services.reduce((n, s) => n + s.characteristics.length, 0);
      this.set({
        status: 'ativo',
        message: `${services.length} serviço(s), ${total} característica(s). ${this.unsubs.length} notificação(ões) assinada(s).`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|chooser/i.test(msg)) this.set({ status: 'idle', message: 'Seleção cancelada' });
      else {
        this.set({ status: 'erro', message: msg });
        reportError('ble-explorer', e);
      }
    }
  }

  private record(service: string, uuid: string, v: DataView, how: 'leitura' | 'notificacao') {
    const hex = toHex(v);
    const text = asciiPreview(v);
    const decoded = decodeKnown(uuid, v);
    const cur = this.state.services.find((s) => s.uuid === service)?.chars.find((c) => c.uuid === uuid);
    this.updateChar(service, uuid, {
      lastHex: hex,
      lastText: text,
      decoded,
      error: undefined,
      notifications: (cur?.notifications ?? 0) + (how === 'notificacao' ? 1 : 0),
    });
    capture({
      src: 'ble-explorer',
      kind: 'bruto',
      data: hex,
      meta: { service, char: uuid, how, text, decoded, n: v.byteLength },
    });
  }

  async stop() {
    for (const u of this.unsubs) await u().catch(() => undefined);
    this.unsubs = [];
    await this.link?.disconnect().catch(() => undefined);
    this.link = null;
    if (this.state.status !== 'idle') this.set({ status: 'desconectado', message: 'Exploração encerrada' });
  }
}

export const bleExplorer = new BleExplorer();
