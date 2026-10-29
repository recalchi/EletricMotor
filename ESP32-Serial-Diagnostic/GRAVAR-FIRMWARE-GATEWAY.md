# Gravar o firmware gateway (EletricMotor) na sua placa — feito no PC

> **Este app nunca grava firmware.** Os passos abaixo são do computador, por sua conta.
>
> **Compilação verificada (29/10/2026):** `firmware/esp32-gateway/esp32-gateway.ino` compila sem erros para "ESP32 Dev Module" com **arduino-cli 1.5.2, core esp32 3.3.12, NimBLE-Arduino 2.5.2, OneWire 2.3.8, DallasTemperature 4.0.6**: 673.232 bytes (51% da área de programa), 42.212 bytes de RAM (12%). **Não foi gravado nem testado em placa** — só compilado.

Placa: ESP32 DevKit 38 pinos, ESP-WROOM-32, CP2102, flash 4 MB (confirmado pelo log de boot).
Hoje ela roda firmware Espressif AT de fábrica (inferência pelo log). **Gravar o gateway substitui o ESP-AT.**

## 0. (Recomendado) Guardar uma cópia do firmware atual
Só leitura da flash; permite voltar ao estado de fábrica.
```bash
pip install esptool
esptool.py --port COM5 --baud 460800 read_flash 0 0x400000 backup_esp32_fabrica.bin
```
(Troque `COM5` pela porta da placa. 0x400000 = 4 MB.)

## 1-alt. Atalho sem Arduino IDE: binário pronto (opcional)
`dist/esp32-gateway-esp32devmodule-merged.bin` (4 MB, SHA-256 `c4e2ab6fefc69c911dfccddefbee5040db72ba6b7fa67d5e6efb8922aac52a62`), compilado do `.ino` do repositório com `DEVICE_ID "esp32-hub"` e **Wi-Fi/token vazios**. Ele sobrescreve toda a flash (inclui o ESP-AT), por isso faça o backup do passo 0 antes.
```bash
esptool.py --port COM5 --baud 460800 write_flash 0x0 esp32-gateway-esp32devmodule-merged.bin
```
Depois pule para o passo 3. Se preferir compilar você mesmo, siga o passo 1.

## 1. Preparar o Arduino IDE 2.x
1. Placas → instale **esp32 by Espressif Systems 3.x**.
2. Bibliotecas: **OneWire**, **DallasTemperature**, **NimBLE-Arduino 2.x**.
3. Abra `firmware/esp32-gateway/esp32-gateway.ino`.
4. Copie `secrets.example.h` para `secrets.h` e deixe `DEVICE_ID "esp32-hub"`. Deixe `WIFI_SSID ""` (sem envio pela internet por enquanto).

## 2. Gravar
- Placa: **ESP32 Dev Module**. Porta: a da sua placa. Velocidade: 921600 (ou 115200 se falhar).
- Clique em Carregar. Se aparecer "Connecting…" travado, segure **BOOT**, toque **EN** e solte **BOOT** (muitas placas fazem isso sozinhas).

## 3. Conferir
- Monitor Serial a **115200**: uma linha EMGP a cada 2 s, como `{"v":1,"dev":"esp32-hub","seq":0,"ch":{"t1":24.81},...}`.
- Sem o DS18B20 ligado, aparece `# sensor DS18B20 desconectado` (normal).
- **Fechar o ciclo com o celular:** rode este app; deve concluir com “Mensagens EMGP v1 do firmware gateway”, sem precisar apertar EN.

## Ligação do sensor
DS18B20: VCC → 3V3, GND → GND, DATA → GPIO 4 com resistor de 4,7 kΩ entre DATA e 3V3. Alimentação da placa por powerbank/bateria **própria**, nunca derivada da alta tensão ou do chicote da moto (aviso do próprio firmware).
