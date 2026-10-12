# EletricMotor no Android (APK)

O APK empacota o mesmo app web com o Capacitor e acrescenta acesso **nativo** a:

| Recurso                                              | No APK                                                                             | No navegador                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| Bluetooth LE (gateway NUS, sensores ESS, explorador) | plugin nativo — descoberta **completa** de serviços                                | Web Bluetooth (só serviços declarados) |
| USB serial (gateway via cabo OTG)                    | plugin nativo `UsbSerial` (CP210x, CH34x, FTDI, PL2303, CDC/ESP32)                 | Web Serial (somente desktop)           |
| Exportar CSV/JSONL/relatórios                        | grava no app e abre o **compartilhamento** do Android                              | download                               |
| Login                                                | e-mail/senha ou modo demonstração (login Google por popup não funciona no WebView) | todos                                  |

Tudo é **somente leitura**: não existe função que envie dados ao dispositivo conectado.

## Instalar no celular

1. Copie `apk/EletricMotor-debug.apk` para o celular (cabo USB, Drive, WhatsApp para você mesmo…).
2. Abra o arquivo e permita **“instalar apps desconhecidos”** para o app usado (Arquivos/Drive).
3. Na primeira conexão Bluetooth, aceite a permissão **Dispositivos próximos**.
4. Para USB: conecte o gateway com um **cabo/adaptador OTG**; o Android pergunta se o EletricMotor pode acessar o dispositivo — aceite.

> APK de **depuração** assinado pelo autor (certificado `CN=Renan Recalchi`). A chave (`.jks`) e as senhas (`android/keystore.properties`) ficam **fora do git**; sem elas o build usa a chave de debug padrão. Guarde o `.jks` — atualizações só instalam por cima se assinadas com a mesma chave.

## Roteiro de teste no celular

1. Entrar em modo demonstração (ou e-mail/senha).
2. **Captura e diagnóstico → Iniciar gravação**.
3. **Conectividade → Gateway Bluetooth (UART/NUS)** ou **Gateway USB** → Conectar → mensagens aparecem no console de teste.
4. **Captura e diagnóstico → Explorar dispositivo** → escolha um dispositivo BLE → veja serviços, leituras e notificações.
5. Parar a gravação → **Exportar JSONL** → compartilhar o arquivo para análise.
6. Erros do app ficam em **Registro de erros** → Exportar/Copiar.

## Gerar o APK novamente (no PC)

Ferramentas instaladas em `D:\DevTools` (JDK 21, Android SDK, cache do Gradle):

```bash
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
```

Saída: `apk/EletricMotor-debug.apk`.
