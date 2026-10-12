import { BaseAdapter } from './adapter';

/**
 * Placeholder do gateway físico. NÃO implementa nenhum protocolo: a interface eletrônica da EVS
 * (CAN/UART/BLE/OBD/API) ainda não foi identificada nem validada. Ver docs/integration-manual.
 */
export class GatewayAdapter extends BaseAdapter {
  id = 'gateway';
  name = 'Gateway de leitura (futuro)';
  kind = 'gateway' as const;
  description = 'Somente leitura. Aguardando identificação documentada da interface da moto.';

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
