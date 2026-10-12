import { DeviceStreamAdapter } from './DeviceStreamAdapter';

const bleSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

/** UUIDs do Nordic UART Service (NUS) — padrão de fato para UART sobre BLE. */
export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_TX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notificações dispositivo → app

/** Gateway próprio via Bluetooth LE usando Nordic UART Service; recebe EMGP. */
export class BleNusAdapter extends DeviceStreamAdapter {
  id = 'ble-nus';
  name = 'Gateway Bluetooth (UART/NUS)';
  kind = 'gateway' as const;
  transport = 'ble-nus' as const;
  description = 'Recebe linhas EMGP de um gateway próprio via BLE (Nordic UART Service). Somente leitura.';

  private device: BluetoothDevice | null = null;
  private char: BluetoothRemoteGATTCharacteristic | null = null;
  private decoder = new TextDecoder();
  private onValue = (ev: Event) => {
    const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (v) this.feedText(this.decoder.decode(v, { stream: true }));
  };
  private onDisconnected = () => {
    this.setState('desconectado', 'Dispositivo BLE desconectado');
    this.log('warn', this.st.message);
  };

  static supported = bleSupported;

  async connect() {
    if (!bleSupported()) {
      this.setState('erro', 'Web Bluetooth indisponível neste navegador');
      this.log('error', this.st.message);
      return;
    }
    try {
      this.setState('conectando', 'Selecione o dispositivo…');
      this.device = await navigator.bluetooth!.requestDevice({ filters: [{ services: [NUS_SERVICE] }] });
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      const server = await this.device.gatt!.connect();
      const svc = await server.getPrimaryService(NUS_SERVICE);
      this.char = await svc.getCharacteristic(NUS_TX_CHAR);
      this.char.addEventListener('characteristicvaluechanged', this.onValue);
      await this.char.startNotifications();
      this.setState('conectado', `Conectado a ${this.device.name ?? this.device.id}`);
      this.log('info', this.st.message);
    } catch (e) {
      this.setState('erro', e instanceof Error ? e.message : String(e));
      this.log('error', `Falha BLE: ${this.st.message}`);
    }
  }

  async disconnect() {
    this.char?.removeEventListener('characteristicvaluechanged', this.onValue);
    await this.char?.stopNotifications().catch(() => undefined);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.device?.gatt?.disconnect();
    this.device = null;
    this.setState('desconectado', 'Desconectado');
    this.log('info', 'BLE desconectado');
  }
}

/**
 * Sensor BLE comercial que implementa o Environmental Sensing Service (0x181A) do Bluetooth SIG:
 * Temperature 0x2A6E (sint16, 0,01 °C) e Humidity 0x2A6F (uint16, 0,01 %). Formatos definidos pela
 * especificação GATT — não é engenharia reversa de nenhum produto.
 * As leituras são convertidas para EMGP com canais "t" e "h"; o id do dispositivo é "ess-<id BLE>".
 */
export class BleEssAdapter extends DeviceStreamAdapter {
  id = 'ble-ess';
  name = 'Sensor ambiental Bluetooth (padrão ESS)';
  kind = 'gateway' as const;
  transport = 'ble-ess' as const;
  description = 'Temperatura/umidade de sensores que seguem o Environmental Sensing Service padrão. Somente leitura.';
  pollMs = 5000;

  private device: BluetoothDevice | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  devId = '';

  static supported = bleSupported;

  static decodeTemperature(v: DataView) {
    return v.getInt16(0, true) / 100;
  }
  static decodeHumidity(v: DataView) {
    return v.getUint16(0, true) / 100;
  }

  async connect() {
    if (!bleSupported()) {
      this.setState('erro', 'Web Bluetooth indisponível neste navegador');
      this.log('error', this.st.message);
      return;
    }
    try {
      this.setState('conectando', 'Selecione o sensor…');
      this.device = await navigator.bluetooth!.requestDevice({ filters: [{ services: ['environmental_sensing'] }] });
      this.devId = `ess-${this.device.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
      const server = await this.device.gatt!.connect();
      const svc = await server.getPrimaryService('environmental_sensing');
      const temp = await svc.getCharacteristic('temperature').catch(() => null);
      const hum = await svc.getCharacteristic('humidity').catch(() => null);
      if (!temp && !hum) throw new Error('Sensor não expõe temperatura nem umidade padrão');
      const poll = async () => {
        const ch: Record<string, number> = {};
        if (temp) ch.t = BleEssAdapter.decodeTemperature(await temp.readValue());
        if (hum) ch.h = BleEssAdapter.decodeHumidity(await hum.readValue());
        const msg = { v: 1 as const, dev: this.devId, seq: this.seq++, ch };
        this.handleMessage(msg, JSON.stringify(msg));
      };
      await poll();
      this.timer = setInterval(
        () => void poll().catch((e) => this.log('warn', `Leitura falhou: ${String(e)}`)),
        this.pollMs,
      );
      this.setState('conectado', `Conectado a ${this.device.name ?? this.devId} (id EMGP: ${this.devId})`);
      this.log('info', this.st.message);
    } catch (e) {
      this.setState('erro', e instanceof Error ? e.message : String(e));
      this.log('error', `Falha BLE: ${this.st.message}`);
    }
  }

  async disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.device?.gatt?.disconnect();
    this.device = null;
    this.setState('desconectado', 'Desconectado');
    this.log('info', 'Sensor ESS desconectado');
  }
}
