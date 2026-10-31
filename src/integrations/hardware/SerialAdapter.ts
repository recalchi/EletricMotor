import { openSerial, serialSupported, type SerialLink } from '../../platform/serial';
import { isNative } from '../../platform/native';
import { DeviceStreamAdapter } from './DeviceStreamAdapter';

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800] as const;

/**
 * Gateway próprio via USB serial. Navegador: Web Serial (Chrome/Edge desktop). APK: USB OTG nativo.
 * Recebe EMGP; qualquer outro conteúdo fica registrado (console + captura) para análise.
 */
export class SerialAdapter extends DeviceStreamAdapter {
  id = 'usb-serial';
  name = 'Gateway USB (serial)';
  kind = 'gateway' as const;
  transport = 'serial' as const;
  description = 'Lê linhas EMGP de um gateway próprio pela USB (no celular: cabo OTG). Somente leitura.';
  baudRate = 115200;

  private link: SerialLink | null = null;

  static supported() {
    return serialSupported();
  }

  async connect(opts: { grantedOnly?: boolean } = {}) {
    if (!serialSupported()) {
      this.setState('erro', 'USB serial indisponível — no computador use Chrome/Edge; no celular use o APK');
      this.log('error', this.st.message);
      return;
    }
    try {
      this.setState('conectando', isNative() ? 'Autorize o acesso ao dispositivo USB…' : 'Selecione a porta…');
      this.link = await openSerial(this.baudRate, opts);
      this.link.onData((b) => this.feedBytes(b));
      this.link.onError((e) => {
        this.setState('erro', `Conexão serial interrompida: ${e.message}`);
        this.log('error', this.st.message);
        this.link = null;
      });
      this.setState('conectado', this.link.label);
      this.log('info', `Porta aberta: ${this.link.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Cancelar o seletor não é erro do programa
      if (/No port selected|cancel/i.test(msg)) this.setState('desconectado', 'Seleção cancelada');
      else {
        this.setState('erro', msg);
        this.log('error', `Falha ao abrir porta: ${msg}`);
      }
    }
  }

  async disconnect() {
    await this.link?.close().catch(() => undefined);
    this.link = null;
    this.setState('desconectado', 'Porta fechada');
    this.log('info', 'Porta serial fechada');
  }
}
