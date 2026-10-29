# Análise do diagnóstico nº 3 (app v0.3.0, 29/10/2026 08:22)

**Resultado:** `SERIAL_DATA_OK`, confiança alta. Banner de boot do ESP32 detectado **+14,6 s** após o início da escuta (o usuário apertou EN/RESET), a 115200 baud.

## Confirmado
- **A UART do ESP32 chega ao celular a 115200 8N1** via CP2102. O problema nunca foi baud, driver, permissão nem o app de leitura.
- Dados reais chegam em pacotes de **32 B** (≈ 11,4 KB/s = vazão de UART a 115200). O "lixo" é um pacote **constante de 33 B** (115.970 de 116.050 leituras na janela de escuta), independente do baud. Os dois são distinguíveis; filtrar o pacote constante é seguro.
- Leitura de volta do chip, em todas as velocidades: `erros=0x0 filaRX=0 filaTX=0`, baud lido = pedido, linha 8N1. Ou seja, **o próprio CP2102 não "enxerga" esse fluxo como dado de UART** (fila RX vazia): o lixo não vem da UART dele.
- Log de boot do ESP32 recebido (trecho):
  - `rst:0x1 (POWERON_RESET), boot:0x13 (SPI_FAST_FLASH_BOOT)`; flash 4 MB, DIO, 40 MHz; ESP-IDF `qa-test-v4.3.3-20220423`; chip revision 3.
  - Partições: `phy_init`, `otadata`, `nvs`, **`at_customize`**, `ota_0`, `ota_1`; depois `module_name:WROOM-32`, `max tx power=78,ret=0`, `2.4.0`.

## Interpretação (inferência, não confirmada por comando)
- A partição `at_customize` + `module_name:` + OTA duplo é a assinatura de **firmware Espressif AT de fábrica** (versão 2.4.x), não do firmware do EletricMotor.
- Em ESP-AT, a interface de comandos fica na UART1 (GPIO16/17), não na UART0 do conector USB; pelo USB saem logs de boot. Isso explica o "silêncio" depois do boot, o HTTP inexistente em `192.168.4.1` e a rede `ESP_32BDD` sem serviço web.

## Ainda não determinado
- **Origem do pacote constante de 33 B** (chip/clone CP2102, comportamento do Android 17 com esse chip, ou cabo). Os apps antigos (Serial USB Terminal etc.) travavam por serem inundados por ele. O teste da mesma placa no PC separaria "chip/cabo" de "celular".
- Se o ESP-AT responde a comandos: o app **não envia nada** (regra de segurança), então não foi testado.
