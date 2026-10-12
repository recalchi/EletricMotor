import { capture, toHex } from '../../app/diagnostics';
import { bleSupported, requestBle, type BleLink } from '../../platform/ble';
import { uuid16 } from '../../platform/native';
import { DeviceStreamAdapter } from './DeviceStreamAdapter';

/** UUIDs do Nordic UART Service (NUS) — padrão de fato para UART sobre BLE. */
export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_TX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notificações dispositivo → app

export const ESS_SERVICE = uuid16(0x181a);
export const ESS_TEMPERATURE = uuid16(0x2a6e);
export const ESS_HUMIDITY = uuid16(0x2a6f);

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

/**
 * Base BLE com reconexão automática (backoff exponencial) quando o enlace cai sem o usuário pedir.
 */
abstract class BleBase extends DeviceStreamAdapter {
  protected link: BleLink | null = null;
  private userClosed = false;
  private reconnecting = false;

  static supported = bleSupported;

  /** Prepara assinaturas/leitura após (re)conectar. */
  protected abstract attach(link: BleLink): Promise<void>;
  protected abstract detach(): Promise<void>;
  protected abstract request(): Promise<BleLink>;

  async connect() {
    if (!bleSupported()) {
      this.setState('erro', 'Bluetooth indisponível neste navegador — use Chrome/Edge ou o APK');
      this.log('error', this.st.message);
      return;
    }
    this.userClosed = false;
    try {
      this.setState('conectando', 'Selecione o dispositivo…');
      const link = await this.request();
      this.link = link;
      link.onDisconnect(() => void this.handleDrop());
      await this.attach(link);
      this.setState('conectado', `Conectado a ${link.name}`);
      this.log('info', this.st.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|User cancelled|chooser/i.test(msg)) this.setState('desconectado', 'Seleção cancelada');
      else {
        this.setState('erro', msg);
        this.log('error', `Falha BLE: ${msg}`);
      }
    }
  }

  private async handleDrop() {
    if (this.userClosed || this.reconnecting || !this.link) return;
    this.reconnecting = true;
    this.log('warn', 'Conexão BLE perdida — tentando reconectar');
    for (const wait of BACKOFF_MS) {
      this.setState('conectando', `Reconectando em ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      if (this.userClosed || !this.link) break;
      try {
        await this.link.reconnect();
        await this.attach(this.link);
        this.setState('conectado', `Reconectado a ${this.link.name}`);
        this.log('info', this.st.message);
        this.reconnecting = false;
        return;
      } catch (e) {
        this.log('warn', `Reconexão falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.reconnecting = false;
    if (!this.userClosed) {
      this.setState('erro', 'Não foi possível reconectar — aproxime o dispositivo e conecte novamente');
      this.log('error', this.st.message);
    }
  }

  async disconnect() {
    this.userClosed = true;
    await this.detach().catch(() => undefined);
    await this.link?.disconnect().catch(() => undefined);
    this.link = null;
    this.setState('desconectado', 'Desconectado');
    this.log('info', 'BLE desconectado');
  }
}

/** Gateway próprio via Bluetooth LE usando Nordic UART Service; recebe EMGP. */
export class BleNusAdapter extends BleBase {
  id = 'ble-nus';
  name = 'Gateway Bluetooth (UART/NUS)';
  kind = 'gateway' as const;
  transport = 'ble-nus' as const;
  description = 'Recebe linhas EMGP de um gateway próprio via BLE (Nordic UART Service). Somente leitura.';
  private unsub: (() => Promise<void>) | null = null;

  protected request() {
    return requestBle({ services: [NUS_SERVICE] });
  }
  protected async attach(link: BleLink) {
    this.unsub = await link.subscribe(NUS_SERVICE, NUS_TX_CHAR, (v) =>
      this.feedBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)),
    );
  }
  protected async detach() {
    await this.unsub?.();
    this.unsub = null;
  }
}

/**
 * Sensor BLE comercial que implementa o Environmental Sensing Service (0x181A) do Bluetooth SIG:
 * Temperature 0x2A6E (sint16, 0,01 °C) e Humidity 0x2A6F (uint16, 0,01 %). Formatos definidos pela
 * especificação GATT — não é engenharia reversa de nenhum produto.
 * As leituras são convertidas para EMGP com canais "t" e "h"; o id do dispositivo é "ess-<id BLE>".
 */
export class BleEssAdapter extends BleBase {
  id = 'ble-ess';
  name = 'Sensor ambiental Bluetooth (padrão ESS)';
  kind = 'gateway' as const;
  transport = 'ble-ess' as const;
  description = 'Temperatura/umidade de sensores que seguem o Environmental Sensing Service padrão. Somente leitura.';
  pollMs = 5000;
  devId = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;

  static decodeTemperature(v: DataView) {
    return v.getInt16(0, true) / 100;
  }
  static decodeHumidity(v: DataView) {
    return v.getUint16(0, true) / 100;
  }

  protected request() {
    return requestBle({ services: [ESS_SERVICE] });
  }

  protected async attach(link: BleLink) {
    this.devId = `ess-${link.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
    const svc = (await link.services()).find((s) => s.uuid.toLowerCase() === ESS_SERVICE);
    const has = (u: string) => !!svc?.characteristics.some((c) => c.uuid.toLowerCase() === u && c.properties.read);
    const hasT = has(ESS_TEMPERATURE);
    const hasH = has(ESS_HUMIDITY);
    if (!hasT && !hasH) throw new Error('Sensor não expõe temperatura nem umidade padrão legíveis');
    const poll = async () => {
      const ch: Record<string, number> = {};
      if (hasT) {
        const v = await link.read(ESS_SERVICE, ESS_TEMPERATURE);
        capture({ src: this.id, kind: 'bruto', data: toHex(v), meta: { char: '2a6e' } });
        ch.t = BleEssAdapter.decodeTemperature(v);
      }
      if (hasH) {
        const v = await link.read(ESS_SERVICE, ESS_HUMIDITY);
        capture({ src: this.id, kind: 'bruto', data: toHex(v), meta: { char: '2a6f' } });
        ch.h = BleEssAdapter.decodeHumidity(v);
      }
      const msg = { v: 1 as const, dev: this.devId, seq: this.seq++, ch };
      this.handleMessage(msg, JSON.stringify(msg));
    };
    await poll();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(
      () => void poll().catch((e) => this.log('warn', `Leitura falhou: ${String(e)}`)),
      this.pollMs,
    );
    this.log('info', `ID EMGP deste sensor: ${this.devId}`);
  }

  protected async detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
