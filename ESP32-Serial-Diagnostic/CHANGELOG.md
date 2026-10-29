# Changelog

## 0.3.0 — 29/10/2026 (pós-diagnóstico nº 2)
Base: [ANALISE-DIAGNOSTICO-2.md](ANALISE-DIAGNOSTICO-2.md).
- **Teste de RESET manual:** se não houver texto/assinatura, o app mostra em vermelho "APERTE E SOLTE o botão EN/RESET da placa AGORA" e escuta 20 s a 115200, procurando o banner de boot **dentro** do fluxo ruidoso. O app continua sem resetar nada; só o usuário aperta o botão.
- **Assinaturas fortes** (`rst:0x`, `ESP-ROM:`, `ets Jul`, `boot:0x`, `waiting for download`, Brownout, Guru Meditation…) valem mesmo em fluxo ilegível; assinaturas fracas (`I (`, `E (`) só em texto.
- **Novo desfecho:** banner dentro do ruído = `SERIAL_DATA_OK` com a conclusão de que a UART do ESP32 chega ao celular.
- **Pacotes idênticos deduplicados** após os 4 primeiros KB (contados, não guardados); registro do tamanho de cada leitura (`readSizes`); buffer zerado a cada leitura (descarta "buffer velho").
- **Varredura mais curta:** após 3 velocidades seguidas com fluxo impossível, o restante é pulado como redundante.
- **GET_COMM_STATUS do CP210x** (erros e filas RX/TX do chip) na leitura de volta.
- Aviso de RESET em destaque na tela. Testes: 38 → 42.

## 0.2.0 — 29/10/2026 (pós-diagnóstico nº 1)
Motivado pelo primeiro ZIP real (Samsung SM-S942B, Android 17, CP2102 `10C4:EA60`). Análise em [ANALISE-DIAGNOSTICO-1.md](ANALISE-DIAGNOSTICO-1.md).

- **Leitura de volta do chip (somente GET, endpoint 0, conexão separada):** modelo do CP210x (CP2102 × CP2102N), baud realmente aplicado (`0x1D`), linha (`0x04`) e modem (`0x08`), após cada troca de baud. Prova se o baud pedido "pegou".
- **Vazão × limite físico:** cada captura compara bytes/s recebidos com `baud/10`. Fluxo > 4× o limite (após 1,5 s) é marcado como **impossível** e encerra a captura cedo.
- **Novo resultado `SERIAL_RATE_ANOMALY`** com conclusões e próximos passos específicos (teste da mesma placa no PC para separar placa × celular/app).
- **Padrão periódico** (menor período ≤ 256 bytes, ≥ 95% de repetição), contagem de valores distintos e bytes mais frequentes.
- **Parada antecipada só com texto legível** (antes parava aos 4 KB mesmo com lixo, encurtando a evidência).
- **Mais bauds na varredura passiva:** 230400, 460800, 921600, 1000000, 2000000 (além de 74880, 9600, 57600).
- `serial.txt`: linhas repetidas colapsadas; cabeçalho com bytes recebidos/leituras e marca de vazão anômala. `summary.json`/`usb.json`: `chip`, `chipReadbacks`, `rateBytesPerSec`, `physicalMaxBytesPerSec`, `rateAnomaly`, `repeatPeriodBytes`, `distinctByteValues`, `topBytes`.
- Testes: 31 → 38.

## 0.1.0 — 28/10/2026
Versão inicial: diagnóstico serial passivo, fallbacks, Wi-Fi opcional, ZIP.
