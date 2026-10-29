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

## Versão e atualização do firmware
- O firmware anuncia `# fw name=esp32-gateway version=X.Y.Z …` no boot e a cada 60 s; o app EletricMotor mostra a
  versão e avisa quando há atualização no catálogo (`src/integrations/firmware.ts`).
- **Atualizar pelo app** (tela Firmware): mesmas verificações, backup conferido pelo chip, barra de progresso com
  tempo estimado por etapa, erro resumido e histórico. No APK (USB OTG) ainda não testado em hardware.
- **Atualizar pelo PC (Windows)** com verificações de segurança:
  ```powershell
  # só confere tudo e faz backup, sem gravar:
  .\tools\atualizar-firmware.ps1 -Firmware <esp32-gateway-X.Y.Z-merged.bin> -Sha256 <hash do catálogo> -DryRun
  # grava de verdade:
  .\tools\atualizar-firmware.ps1 -Firmware <esp32-gateway-X.Y.Z-merged.bin> -Sha256 <hash do catálogo>
  # voltar ao estado anterior:
  .\tools\atualizar-firmware.ps1 -Restaurar <backup_*.bin>
  ```
  O script: identifica a placa (ESP32 + flash de 4 MB), confere nos eFuses que criptografia de flash e Secure Boot
  estão desligados, faz backup completo conferido contra a própria flash, grava com verificação por hash e só
  conclui se o firmware anunciar `# fw …` sem sinal de pane. Qualquer falha aborta antes de gravar.
- Requer o driver **Silicon Labs CP210x** (Windows Update o oferece para `USB\VID_10C4&PID_EA60`) e esptool ≥ 5
  (vem com o core esp32 do Arduino).
- Ao publicar nova versão: suba `FW_VERSION` no `.ino`, compile, gere o binário completo (merged) e acrescente a
  versão com o SHA-256 em `FIRMWARE_CATALOG`.
- Observação de hardware: nesta placa (CP2102), leituras longas da flash acima de 115200 baud caíram de forma
  reprodutível; por isso o backup usa 115200 (≈ 6 min). A gravação a 460800 funcionou e é conferida por hash.
