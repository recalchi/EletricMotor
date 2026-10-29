# Gravar o firmware gateway (EletricMotor) na sua placa — feito no PC

> **Este app nunca grava firmware.** Os passos abaixo são do computador, por sua conta. Não compilei este `.ino` aqui (não há toolchain Arduino configurada), então a 1ª compilação pode pedir ajustes de versão de biblioteca.

Placa: ESP32 DevKit 38 pinos, ESP-WROOM-32, CP2102, flash 4 MB (confirmado pelo log de boot).
Hoje ela roda firmware Espressif AT de fábrica (inferência pelo log). **Gravar o gateway substitui o ESP-AT.**

## 0. (Recomendado) Guardar uma cópia do firmware atual
Só leitura da flash; permite voltar ao estado de fábrica.
```bash
pip install esptool
esptool.py --port COM5 --baud 460800 read_flash 0 0x400000 backup_esp32_fabrica.bin
```
(Troque `COM5` pela porta da placa. 0x400000 = 4 MB.)

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
