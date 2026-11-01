# Conector de 3 pinos na lateral direita — 2026-11-01 (somente medição e escuta)

> Guia usado: [teste-conector-3pinos.html](../../../public/guia/teste-conector-3pinos.html) (no app do PC: `/guia/teste-conector-3pinos.html`).
> Nada foi enviado à moto: multímetro e escuta serial com o ESP32 parado (EN no GND), que só repassa o sinal ao notebook.

## O conector
Conector solto de 3 vias — amarelo, verde e preto — atrás da carenagem lateral direita, perto da controladora.
Não há pinagem pública da Voltz EVS. Em controladoras de mercado (Votol, Fardriver, Sabvoton) um conector assim
costuma ser a porta serial de programação (preto = GND, TX/RX, em geral 115200 baud) ou uma entrada de acessório.

## Etapa A — multímetro (ponta preta no fio preto)
| Fio | Moto desligada | Moto ligada | Ligada: o número… |
|---|---|---|---|
| amarelo | 0 V | 0 V | parado |
| verde | 0 V | **5,70 V** | parado |

O verde só tem tensão com a moto ligada e fica parado: saída serial em repouso (nível alto) ou alimentação de 5 V.
O amarelo em 0 V não é saída serial; se for a porta de programação, é a entrada da controladora.

## Etapa B — escuta no verde
| Hora | O quê | Resultado |
|---|---|---|
| 18:25 | ESP32 parado, moto desligada | 0 bytes — a placa ficou parada, como esperado |
| 18:27 | verde, 115200 por 90 s (ligando a moto) | 0 bytes |
| 18:28 | verde, 8 velocidades × 10 s (1200…115200) | 0 bytes, 0 erros de quadro |
| depois | conferência do divisor no ponto TX | **5,57 V** (esperado ~2,85 V) → montagem errada |

Como o divisor não dividia, a tentativa 1 **não vale como conclusão**. Causas prováveis: resistores de valores
diferentes, ou o R2 sem chegar ao GND (trilha azul da protoboard cortada no meio). O pino TX ficou exposto a ~5,6 V
através de R1, com corrente abaixo de 1 mA.

## Próximo
1. Tentativa 2 com a montagem nova do guia: 3 colunas (SINAL / TX / GND), sem usar a trilha azul, resistores
   medidos antes, e conferência de 2,6–3,1 V no ponto TX **antes** de ligar o TX do ESP32.
2. Foto da etiqueta da controladora (marca/modelo) para achar o protocolo.
3. Se a escuta continuar sem bytes com a montagem certa: a linha só responde a pedido. Enviar pedido é leitura
   ativa (nível 5) — decisão do dono, com o protocolo identificado.
