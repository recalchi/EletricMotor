# Relatório de testes — v0.1.0 (28/10/2026)

## Executado e aprovado (automatizado)
| Verificação | Resultado |
|---|---|
| Testes unitários JVM (`testDebugUnitTest`) | **31/31** (19 máquina de estados, 7 redação/analisador/log, 5 ZIP/relatório) |
| Lint Android (`lintDebug`) | 0 erros, 2 avisos (versão de dependência, `allowBackup`) |
| Build `assembleDebug` | OK — APK 2,2 MB, SHA-256 `d8c9ae48c727f73a1b9252b5ef86a944318a59bc390aaa1d5865799fd30cde0b` |
| Manifesto (aapt2) | minSdk 24, targetSdk 35, permissões: só `ACCESS_NETWORK_STATE` e `INTERNET` |

Cenários simulados (gateway USB falso, relógio simulado): sem dispositivo, sem driver, fallback CP21xx, permissão negada/expirada, abertura com falha (limite de 3 tentativas + backoff), abertura que trava (timeout), dados a 115200, porta muda (varredura passiva, 0 bytes escritos), texto só em outro baud, ruído, queda USB com reconexão, queda com dispositivo ausente, cancelamento, exceção inesperada, limite de tamanho da captura, ordem dos estados.

## Executado manualmente em emulador (Android 14, x86_64, sem USB)
- Instala e abre; tela estável (tema claro fixo, sem animações); sem crash no logcat.
- **Iniciar diagnóstico** sem USB → em ~5 s conclui “Nenhum dispositivo USB detectado”, mostra passos e próximos passos.
- ZIP salvo e lido com sucesso (`summary.json` = `NO_DEVICE`, `bytesWrittenToDevice` = 0).
- Observação: o emulador estava lento e mostrou “System UI isn’t responding” na 1ª abertura; é do emulador, não do app.

## NÃO validado (depende de hardware / não executado)
- Comunicação real com o CP2102 (permissão USB, abertura, leitura) — **precisa do celular do usuário + ESP32**.
- Compartilhamento (`ACTION_SEND`) e “Salvar em pasta” (SAF) — botões existem, mas não foram acionados.
- Diagnóstico Wi-Fi em rede real do ESP32 (`ESP_32BDD`).
- Testes instrumentados/UI automatizados: **não existem** (só o teste manual acima).
- Modelo/versão real do Android do usuário não foi consultado (nenhum aparelho conectado ao PC); `minSdk 24` cobre Android 7+.
- O APK é **debug** (assinatura de debug); o CI gera outro APK com chave de debug diferente — use sempre o mesmo APK para atualizar sem desinstalar.

## Riscos conhecidos
- Em alguns Android, o ESP32 pode reiniciar ao plugar o cabo (alimentação), independente do app; o app não aciona reset.
- Se o firmware só imprime no boot, a captura pode vir vazia; o app orienta a apertar EN/RESET físico durante a escuta.
