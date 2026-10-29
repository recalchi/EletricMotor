# Análise do diagnóstico nº 1 (app v0.1.0, 29/10/2026 07:52)

**Aparelho:** Samsung SM-S942B, Android 17 (API 37), arm64-v8a, USB host sim. **Dispositivo:** CP2102 `10C4:EA60`, driver `Cp21xxSerialDriver`.

## Confirmado (evidência no ZIP)
- Detecção, permissão, abertura e configuração 115200 8N1 funcionaram na 1ª tentativa; DTR/RTS "nenhuma ativa"; **0 bytes escritos**.
- A 1ª execução (07:52:14) ocorreu sem cabo → "nenhum dispositivo" (correto). A 2ª (07:52:40) com cabo.
- Em **115200, 74880, 9600 e 57600** chegaram ~4,1 KB em **15–24 ms** cada (≈ 200 KB/s), 42% "legíveis".
- O conteúdo é o **mesmo padrão repetido a cada 33 bytes** em todas as velocidades (bytes tipo `70 8E 0E 0C FC 8E FC 60 70 7E 8C 00 60 00 …`).

## O que isso significa
- Uma UART a 115200 entrega no máximo ≈ 11,5 KB/s; a 9600, ≈ 1 KB/s. O observado é ~20× / ~200× maior. **Logo não é texto serial nessas velocidades**, e o resultado "ilegível" da v0.1.0 era enganoso: o problema não é só "baud errado".
- Mesma vazão e mesmo padrão em 4 bauds diferentes sugere que **a troca de baud não está afetando o fluxo** (baud ignorado/preso pelo chip ou clone) **ou** que a linha RX recebe um sinal periódico rápido (ruído/TX do ESP32 em alta taxa).
- **Não determinado** com os dados desta versão: qual das hipóteses é a verdadeira, e se há relação com o firmware do ESP32, o cabo, o chip (CP2102 × CP2102N × clone) ou o Android 17.

## Ressalva honesta
A v0.1.0 parou cada captura aos 4 KB, então não há dados do comportamento ao longo de 8 s, nem leitura do baud aplicado pelo chip. A v0.2.0 foi feita para obter exatamente isso.

## O que a v0.2.0 coleta para decidir
1. Modelo do chip e **baud lido de volta** após cada configuração (se ≠ pedido → baud ignorado).
2. Vazão medida × limite físico, por baud, incluindo 230400…2000000.
3. Período/entropia do padrão.

## Teste físico complementar (decisivo, ~2 min, fora do app)
Plugar **a mesma placa e o mesmo cabo no PC** e abrir um monitor serial a 115200 (Arduino IDE). Texto normal → problema no celular/app; mesmo lixo → placa/firmware/linha RX.
