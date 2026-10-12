# EletricMotor no Android (APK)

O APK empacota o mesmo app web com o Capacitor e acrescenta acesso **nativo** a:

| Recurso                                              | No APK                                                                             | No navegador                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| Bluetooth LE (gateway NUS, sensores ESS, explorador) | plugin nativo — descoberta **completa** de serviços                                | Web Bluetooth (só serviços declarados) |
| USB serial (gateway via cabo OTG)                    | plugin nativo `UsbSerial` (CP210x, CH34x, FTDI, PL2303, CDC/ESP32)                 | Web Serial (somente desktop)           |
| Exportar CSV/JSONL/relatórios                        | grava no app e abre o **compartilhamento** do Android                              | download                               |
| Login                                                | e-mail/senha ou modo demonstração (login Google por popup não funciona no WebView) | todos                                  |

Tudo é **somente leitura**: não existe função que envie dados ao dispositivo conectado.

## Ativar o login (uma vez, no Firebase Console)
Projeto `eletricmotorz` → **Authentication → Sign-in method**:
1. Ative **E-mail/senha** e **Google** (sem isso aparece “Método de login não habilitado”).
2. **Configurações do projeto → Seus apps → Adicionar app → Android**:
   - Nome do pacote: `com.recalchi.eletricmotor`
   - Impressões digitais do certificado do autor (chave em `D:\DevTools\keys`):
     - SHA-1: `7D:85:01:81:59:8D:20:EC:9D:63:1C:8D:40:CB:AE:DA:BB:EF:50:DF`
     - SHA-256: `AD:BC:D7:82:7D:05:65:75:D4:C8:7B:0F:34:63:BA:88:FB:63:76:1A:92:6D:47:45:D0:28:D2:5B:79:79:46:A0`
3. Baixe o **`google-services.json`** e salve em `android/app/google-services.json` (fica fora do git).
4. Gere o APK de novo. O script recusa gerar sem esse arquivo, porque o Firebase nativo do login Google precisa dele.

No app, “Continuar com Google” abre o seletor de contas do Android; o token é entregue ao Firebase JS SDK e a sessão é a mesma do app web.

## Instalar no celular

1. Copie `apk/EletricMotor-debug.apk` para o celular (cabo USB, Drive, WhatsApp para você mesmo…).
2. Samsung: desligue temporariamente **Configurações → Segurança e privacidade → Bloqueador automático**. Abra o arquivo e permita **“instalar apps desconhecidos”** para o app usado (Arquivos/Drive/WhatsApp). Depois de instalar, religue o bloqueador.
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
