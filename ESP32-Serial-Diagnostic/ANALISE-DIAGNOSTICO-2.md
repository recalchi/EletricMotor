# Análise do diagnóstico nº 2 (app v0.2.0, 29/10/2026 08:10)

**Placa (anúncio da Shopee, prints do usuário):** ESP32 DevKit 38 pinos, ESP-WROOM-32 (ESP32-D0WDQ6), CP2102 on-board, circuito de gravação automática (DTR/RTS → EN/IO0).
**Aparelho:** Samsung SM-S942B, Android 17.

## Confirmado
- O chip foi identificado como **CP2102** (part number lido por GET).
- O chip **confirmou cada baud pedido** (115200, 74880, 9600, 57600, 230400, 460800, 921600, 1 M, 2 M: lido = pedido); linha `0x0800` = 8N1; modem `0x00`.
- Mesmo assim: **272–298 KB/s em todos os bauds** (limite físico de uma UART seria 0,96 a 46 KB/s nos 6 primeiros), mesmo padrão de 33 bytes, mesmo início determinístico nas duas execuções (v0.1.0 e v0.2.0).
- **407.987 B em 12.361 leituras = exatamente 33 B por leitura**: pacotes de tamanho fixo, em sequência contínua, sem pausas. Dado de UART real chega em tamanhos variáveis e com lacunas.
- Em 921600/1M/2M o fluxo seguiu igual (~65 KB/s armazenados até o limite de 256 KB); não foi marcado como anômalo só porque o limite físico nessas velocidades é maior.

## Conclusão (com nível de certeza)
- **Certo:** o fluxo não é função do baud configurado, logo **não é texto serial vindo da UART nessas velocidades**. A "velocidade errada" deixou de ser hipótese.
- **Consistente com isso, não provado:** (a) o chip/clone devolve um bloco constante quando a linha está ociosa; (b) a linha RX recebe um sinal periódico; (c) comportamento do Android 17/driver. Os dados não separam (a), (b) e (c).
- Explica os sintomas antigos: o Serial USB Terminal travou e outro app "piscou" porque eram inundados por ~280 KB/s de dados.
- Wi-Fi `ESP_32BDD` indica que o ESP32 está vivo; não prova nada sobre a UART.

## Próximo teste (v0.3.0): RESET manual
Se o fluxo for um "lixo de chip ocioso", a UART ainda pode funcionar por baixo. Se o usuário apertar **EN** durante a escuta, o ESP32 imprime o banner de boot (`ets Jul 29 2019…`, `rst:0x1`, `boot:0x13`) a 115200, que o app procura **dentro** do fluxo.
- Banner encontrado → UART do ESP32 chega ao celular; o problema é o lixo constante (tratável no app).
- Banner ausente após apertar EN → o TX do ESP32 não chega ao chip, ou o fluxo o encobre; passa a valer o teste no PC.
