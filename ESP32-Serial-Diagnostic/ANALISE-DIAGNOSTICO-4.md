# Análise do diagnóstico nº 4 (app v0.4.0, 29/10/2026 09:18) — validação em hardware

**Resultado:** `SERIAL_DATA_OK`, confiança alta. A v0.4.0 **funcionou no celular real** (Samsung SM-S942B, Android 17, CP2102).

## O que a v0.4.0 provou em hardware
- **Filtro de ruído:** 84.349 pacotes constantes de 33 B filtrados (≈ 230 KB/s antes do filtro). Restaram 4.791 B de texto limpo (77 linhas), com `TEXT` e assinatura forte de boot ROM.
- **Identificação do firmware** pelo log de boot, sem enviar nada: reset `POWERON_RESET (0x1)`, modo `SPI_FAST_FLASH_BOOT (0x13)`, flash 4 MB DIO 40 MHz, ESP-IDF `qa-test-v4.3.3-20220423`, chip revision 3, partições `phy_init, otadata, nvs, at_customize, ota_0, ota_1`, `module_name:WROOM-32`, indícios de ESP-AT.
- **Escuta pós-RESET:** o banner entrou aos +7,1 s; o app continuou 5 s e pegou o fim do boot (`module_name`, `max tx power=78`, `2.4.0`) em +8,2 s.
- Leitura de volta do chip (CP2102) igual em todos os bauds: baud lido = pedido, `erros=0x0`, `filaRX=0`.

## Observação: dois boots na mesma captura
`ets Jul 29 2019…` aparece em +7,13 s e de novo em +11,38 s (4,25 s depois). Os dois com `rst:0x1 (POWERON_RESET)`, o motivo que o botão EN produz. Um crash/WDT/brownout teria outro código (ex.: `0x7`, `0xc`, `0xf`). **Mais provável: EN apertado duas vezes.** Não dá para provar só com o log; se a placa reiniciar sozinha sem ninguém apertar, repetir sem tocar em nada resolve a dúvida.

## Estado do diagnóstico
| Pergunta | Resposta |
|---|---|
| USB/CP2102/permissão/driver funcionam? | Sim |
| UART do ESP32 chega ao celular a 115200? | Sim (log de boot completo) |
| O app consegue ler com o lixo presente? | Sim, com o filtro da v0.4.0 |
| Que firmware está na placa? | Indícios fortes de ESP-AT de fábrica (inferência; sem comando AT) |
| De onde vem o pacote constante de 33 B? | **Não determinado** (chip/clone, cabo ou Android 17 + CP2102) |

## Consequência para o projeto
O firmware `firmware/esp32-gateway` publica EMGP v1 a 115200 pela USB. Esta placa serve ("ESP32 Dev Module"), mas precisa receber esse firmware pelo PC. Ver [GRAVAR-FIRMWARE-GATEWAY.md](GRAVAR-FIRMWARE-GATEWAY.md). Depois de gravar, este app fecha o ciclo: deve reconhecer `{"v":1,…}` (EMGP) sem precisar apertar EN.
