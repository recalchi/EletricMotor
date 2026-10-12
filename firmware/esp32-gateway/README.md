# Gateway de referência — ESP32 + DS18B20

Firmware de exemplo que publica a temperatura de um sensor **externo** no protocolo EMGP v1
(ver [docs/integration-manual/gateway-protocol.md](../../docs/integration-manual/gateway-protocol.md)).

> **Segurança:** alimentação por bateria própria; nenhuma ligação com a alta tensão ou o chicote da moto;
> cabo longe de partes rotativas e do disco de freio. Superfície ≠ temperatura interna do motor.

## Montagem
| DS18B20 | ESP32 |
|---|---|
| VCC | 3V3 |
| GND | GND |
| DATA | GPIO 4 + resistor 4,7 kΩ para 3V3 |

## Passos
1. Arduino IDE → instale a placa **esp32** (Arduino-ESP32 3.x) e as bibliotecas **OneWire**, **DallasTemperature**, **NimBLE-Arduino**.
2. Copie `secrets.example.h` para `secrets.h` e defina `DEVICE_ID` (ex.: `esp32-hub`).
3. Grave na placa. O monitor serial deve mostrar linhas como `{"v":1,"dev":"esp32-hub","seq":0,"ch":{"t1":24.81},...}`.
4. No app: **Conectividade → Dispositivos → Novo → modelo “ESP32 + temperatura do motor hub”**, ID igual ao `DEVICE_ID`.
5. **Conectar** “Gateway USB” (cabo) ou “Gateway Bluetooth (UART/NUS)”. As leituras aparecem no **Console de teste**.
6. Compare com um termômetro de referência, ajuste offset/escala se necessário e clique em **Validar**.
   A partir daí a temperatura aparece como **REAL** no motor hub (3D, painel, alertas, cobertura).

## Envio pela internet (opcional)
1. Implante a função (`docs/integration-manual/README.md`, seção Nuvem) e entre no app com conta Firebase.
2. Cadastre o dispositivo com transporte **Internet**, clique em **Gerar token** e copie-o para `DEVICE_TOKEN`.
3. Preencha `WIFI_SSID`/`WIFI_PASSWORD`/`INGEST_URL`. O firmware envia lotes de 10 mensagens.
4. No app, conecte o adaptador **Nuvem (ingestão HTTPS)**.
