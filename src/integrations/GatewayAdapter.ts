import { BaseAdapter } from './adapter';

/**
 * Placeholder do gateway físico. NÃO implementa nenhum protocolo: a interface eletrônica da EVS
 * (CAN/UART/BLE/OBD/API) ainda não foi identificada nem validada. Ver docs/integration-manual.
 */
export class GatewayAdapter extends BaseAdapter {
  id = 'evs-direct';
  name = 'Interface direta da moto (BMS/controladora)';
  kind = 'gateway' as const;
  description = 'Leitura do BMS/controladora da EVS. Bloqueada: nenhuma interface documentada e validada.';

  constructor() {
    super();
    this.st.state = 'nao_implementado';
    this.st.message = 'Protocolo não verificado — integração bloqueada até validação';
  }

  async connect() {
    this.log('warn', 'Conexão recusada: nenhum protocolo validado para a Voltz EVS.');
    this.st.state = 'nao_implementado';
  }

  async disconnect() {}
}
