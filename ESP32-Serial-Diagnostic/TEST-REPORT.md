# Relatório de testes — v0.2.0 (29/10/2026)

> A v0.1.0 foi validada no celular real (ver ANALISE-DIAGNOSTICO-1.md): USB, permissão, abertura, configuração e leitura passiva funcionaram, com 0 bytes escritos. A v0.2.0 adiciona leitura de volta do chip e detecção de vazão impossível; essas partes **ainda não rodaram em hardware**.

## Executado e aprovado (automatizado)
| Verificação | Resultado |
|---|---|
| Testes unitários JVM (`testDebugUnitTest`) | **38/38** (23 máquina de estados, 9 redação/analisador/log, 6 ZIP/relatório) |
| Lint Android (`lintDebug`) | 0 erros, 2 avisos (versão de dependência, `allowBackup`) |
| Build `assembleDebug` | OK — APK 2,2 MB, SHA-256 `bee08dee59f70d77f077026bb0ad77cd0048f6510bf662872b2529724195f03c` |
| Manifesto (aapt2) | minSdk 24, targetSdk 35, permissões: só `ACCESS_NETWORK_STATE` e `INTERNET` |

Cenários simulados (gateway USB falso, relógio simulado): sem dispositivo, sem driver, fallback CP21xx, permissão negada/expirada, abertura com falha (limite de 3 tentativas + backoff), abertura que trava (timeout), dados a 115200, porta muda (varredura passiva, 0 bytes escritos), texto só em outro baud, ruído, queda USB com reconexão, queda com dispositivo ausente, cancelamento, exceção inesperada, limite de tamanho da captura, ordem dos estados.

## Executado manualmente em emulador (somente v0.1.0; não repetido na v0.2.0) (Android 14, x86_64, sem USB)
- Instala e abre; tela estável (tema claro fixo, sem animações); sem crash no logcat.
- **Iniciar diagnóstico** sem USB → em ~5 s conclui “Nenhum dispositivo USB detectado”, mostra passos e próximos passos.
- ZIP salvo e lido com sucesso (`summary.json` = `NO_DEVICE`, `bytesWrittenToDevice` = 0).
- Observação: o emulador estava lento e mostrou “System UI isn’t responding” na 1ª abertura; é do emulador, não do app.

## NÃO validado (depende de hardware / não executado)
- Na v0.2.0: GETs de leitura do CP210x (`0x1D`, `0x04`, `0x08`, part number `0xFF/0x370B`) — implementados, **nunca executados em chip real**; podem retornar "n/d" em algum modelo.
- Nova varredura até 2 Mbaud (o CP2102 original só vai até 1 Mbaud; rejeições aparecem como aviso).
- Compartilhamento (`ACTION_SEND`) e “Salvar em pasta” (SAF) — botões existem, mas não foram acionados.
- Diagnóstico Wi-Fi em rede real do ESP32 (`ESP_32BDD`).
- Testes instrumentados/UI automatizados: **não existem** (só o teste manual acima).
- Modelo/versão real do Android do usuário não foi consultado (nenhum aparelho conectado ao PC); `minSdk 24` cobre Android 7+.
- O APK é **debug** (assinatura de debug); o CI gera outro APK com chave de debug diferente — use sempre o mesmo APK para atualizar sem desinstalar.

## Riscos conhecidos
- Em alguns Android, o ESP32 pode reiniciar ao plugar o cabo (alimentação), independente do app; o app não aciona reset.
- Se o firmware só imprime no boot, a captura pode vir vazia; o app orienta a apertar EN/RESET físico durante a escuta.
