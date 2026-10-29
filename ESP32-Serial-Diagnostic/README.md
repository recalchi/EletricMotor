# ESP32 Serial Diagnostic (Android)

App Android único para diagnosticar um ESP32 ligado ao celular por USB (ponte **CP2102**, `10C4:EA60`) e gerar **um ZIP** com as evidências. Fluxo do usuário: instalar → conectar → **Iniciar diagnóstico** → **Exportar** → enviar o ZIP.

## Segurança (garantida no código)
- **Somente leitura.** A interface `SerialSession` não tem método de escrita, reset nem DTR/RTS; o compilador impede o resto do app de transmitir. A biblioteca deixa DTR/RTS em nível inativo ao abrir (CP21xx) e o app nunca os altera.
- Sem flash/erase, comandos AT, reset ou pinos de boot. Nada é enviado a servidores.
- Único envio de dados é opcional (botão Wi-Fi, com confirmação): 1 conexão TCP na porta 80 do gateway privado + 1 `GET /`.
- Redação automática de senhas, tokens, e-mails, MAC, IPs públicos e SSIDs não-ESP.

## O que o app faz
1. Inventário USB (VID/PID, interfaces, endpoints, permissão) — espera até 5 s pelo cabo.
2. Driver: detecção padrão → fallback CP21xx forçado.
3. Permissão USB (Android 12–15: `PendingIntent` mutável + explícito) com timeout.
4. Abertura com 3 tentativas, backoff e timeout (sem travar a UI).
5. 115200 8N1, escuta passiva até 8 s (para cedo só com texto legível); se não houver, varredura passiva de 74880 a 2 Mbaud. Lê de volta (GET) o baud aplicado pelo chip e mede a vazão contra o limite físico.
6. Reconexão limitada (2×) se o USB cair; cancelamento seguro a qualquer momento.
7. Conclusão com nível de confiança, sem inventar causa raiz; reconhece assinaturas (boot ROM, modo download, brownout, Guru Meditation, EMGP v1).

## ZIP exportado
`summary.json`, `device.json`, `usb.json`, `serial.txt` (timestamps + hexdump inicial), `wifi.json` (só se rodou), `app-log.txt`, `README.txt`.

## Instalar
1. Copie o APK para o celular (`dist/esp32-serial-diagnostic-0.2.0-debug.apk`, SHA-256 em `.sha256`).
2. Permita “instalar apps desconhecidos” para o app que abrir o arquivo.
3. Abra, conecte o ESP32 com cabo de **dados** (OTG se preciso) e toque **Iniciar diagnóstico**.

## Compilar
JDK 17 + Android SDK 35.
```bash
./gradlew testDebugUnitTest lintDebug assembleDebug
```
Versões: AGP 8.7.3, Gradle 8.11.1, Kotlin 2.2.10, `minSdk 24`, `targetSdk 35`, [usb-serial-for-android](https://github.com/mik3y/usb-serial-for-android) 3.11.0 (MIT), androidx.core 1.13.1. Sem código nativo (independe de ABI). CI: `.github/workflows/esp32-serial-diagnostic.yml`.

## Limites
Veja [TEST-REPORT.md](TEST-REPORT.md). A comunicação real com o CP2102 só pode ser validada no celular do usuário; se o firmware não imprime nada, o app só consegue dizer isso — não prova defeito.
