# EMGP v1 — EletricMotor Gateway Protocol

Protocolo **próprio** do projeto para sensores/gateways construídos pelo proprietário. Não é, e não descreve,
nenhuma interface interna da Voltz EVS (BMS, controladora, painel). Implementação de referência:
`src/integrations/protocol.ts` (compartilhada com a função de ingestão).

## Mensagem
Uma mensagem JSON por linha (`\n`), no máximo 2048 bytes.

```json
{"v":1,"dev":"esp32-hub","seq":42,"ts":1791820000000,"ch":{"t1":31.25,"h1":55.2},"st":{"bat":3.91}}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `v` | sim | `1` |
| `dev` | sim | 3–40 caracteres `[A-Za-z0-9_-]`; igual ao ID cadastrado no app |
| `seq` | sim | inteiro ≥ 0, crescente; detecta perdas, duplicatas e reinícios |
| `ts` | não | epoch UTC em ms; até 5 min no futuro e 7 dias no passado. Ausente → horário de recebimento |
| `ch` | sim | 1–32 canais `{nome: número}`; nome `[A-Za-z0-9_]{1,24}` |
| `st` | não | status do dispositivo (bateria, RSSI…); não vira telemetria |

Linhas iniciadas com `#` são logs do firmware (vão para o log do adaptador). Outras linhas que não são JSON
válido aparecem no console de teste como erro.

## Mapeamento (no app, não no firmware)
Cada canal é ligado a `componentId` + grandeza + unidade, com calibração `valor = bruto × escala + offset`.
Valores fora da faixa física plausível (ex.: temperatura < −40 ou > 200 °C) são marcados como inválidos.

## Estados do dispositivo
| Estado | Efeito |
|---|---|
| `teste` | leituras só no **console de teste** (não entram na telemetria, alertas ou cobertura) |
| `validado` | leituras viram **REAL** (após checklist de validação com referência independente) |
| `desativado` | leituras descartadas |

Alterar canais/calibração de um dispositivo validado o devolve para `teste`.

## Transportes
| Transporte | Detalhes |
|---|---|
| USB serial | 115200 baud, 8N1 (Web Serial — Chrome/Edge desktop) |
| BLE | Nordic UART Service `6E400001-…`, característica TX `6E400003-…` (notify); linhas podem chegar fragmentadas |
| BLE ESS | sensores comerciais com Environmental Sensing Service padrão (0x181A): temperatura 0x2A6E (sint16 × 0,01 °C), umidade 0x2A6F (uint16 × 0,01 %). O app gera canais `t`/`h` e ID `ess-…` |
| HTTPS | `POST /ingest`, `Authorization: Bearer <token>`, corpo NDJSON (≤ 50 linhas, ≤ 64 KB, ≥ 1 s entre requisições), um único `dev` por requisição |

## Respostas da função de ingestão
| Código | Significado |
|---|---|
| 200 | `{"mode":"real"|"teste","accepted":n,"realSamples":n,"testMessages":n,"errors":[…],"warnings":[…]}` |
| 400 | nenhuma mensagem válida / vários dispositivos na mesma requisição |
| 401 | token ausente, dispositivo não registrado ou token incorreto |
| 404 | índice existe mas o cadastro do dispositivo foi removido |
| 413 | corpo vazio ou > 64 KB |
| 429 | mais de 1 requisição por segundo |
