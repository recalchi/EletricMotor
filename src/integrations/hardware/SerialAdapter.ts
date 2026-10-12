import { DeviceStreamAdapter } from './DeviceStreamAdapter';

/** Gateway próprio via USB (Web Serial — Chrome/Edge em desktop). Recebe EMGP a 115200 baud. */
export class SerialAdapter extends DeviceStreamAdapter {
  id = 'usb-serial';
  name = 'Gateway USB (Web Serial)';
  kind = 'gateway' as const;
  transport = 'serial' as const;
  description = 'Lê linhas EMGP de um gateway próprio (ex.: ESP32) pela USB. Somente leitura.';
  baudRate = 115200;

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private closing = false;

  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect() {
    if (!SerialAdapter.supported()) {
      this.setState('erro', 'Web Serial indisponível — use Chrome ou Edge no computador');
      this.log('error', this.st.message);
      return;
    }
    try {
      this.setState('conectando', 'Selecione a porta…');
      this.port = await navigator.serial!.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      const info = this.port.getInfo();
      this.setState(
        'conectado',
        `Porta aberta (${this.baudRate} baud${info.usbVendorId ? `, VID ${info.usbVendorId.toString(16)}` : ''})`,
      );
      this.log('info', this.st.message);
      this.closing = false;
      void this.readLoop();
    } catch (e) {
      this.setState('erro', e instanceof Error ? e.message : String(e));
      this.log('error', `Falha ao abrir porta: ${this.st.message}`);
    }
  }

  private async readLoop() {
    if (!this.port?.readable) return;
    const decoder = new TextDecoderStream();
    void this.port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => undefined);
    this.reader = decoder.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.feedText(value);
      }
    } catch (e) {
      if (!this.closing) {
        this.setState('erro', 'Conexão serial interrompida');
        this.log('error', `Leitura interrompida: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      this.reader?.releaseLock();
    }
  }

  async disconnect() {
    this.closing = true;
    await this.reader?.cancel().catch(() => undefined);
    await this.port?.close().catch(() => undefined);
    this.port = null;
    this.setState('desconectado', 'Porta fechada');
    this.log('info', 'Porta serial fechada');
  }
}
