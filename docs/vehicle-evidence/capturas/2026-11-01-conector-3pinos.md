# Conector de 3 pinos na lateral direita — 2026-11-01/02 (somente medição e escuta)

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

## Tentativa 2 — divisor corrigido (linhas 4 / 9 / 14 da protoboard)
O R2 estava uma linha abaixo do GND. Corrigido, o divisor passou a dividir: **2,80 V em cada resistor** com a moto
ligada e nada ligado ao ponto do meio. Mas, assim que o ponto do meio é ligado a **qualquer** pino do ESP32, a tensão
cai para ~0,4–0,5 V com a moto ligada (R1 ~4,8–5,2 V, R2 ~0,4–0,7 V).

| Ponto do meio ligado a… | R2 com a moto ligada |
|---|---|
| nada (jumper fora, ou só no furo com a ponta solta) | 2,82–2,83 V |
| TX0 do ESP32 (placa parada por EN) | 0,37 V — escuta: só bytes 00 (linha em nível baixo) |
| GPIO16 (UART2, fw 1.4.0) | 0,47–0,48 V — escuta: só break, nenhum dado |
| GPIO34 (só entrada, alta impedância) | 0,46 V |
| GPIO34 com outro jumper e outro furo | 0,46 V |

## Diagnóstico do lado do ESP32 (2026-11-02) — tudo descartado
| Suspeito | Teste | Resultado |
|---|---|---|
| Pino em curto com o GND | continuidade, USB fora | aberto |
| Pino puxando para baixo | tensão do pino 16 solto, USB ligado | 3,15 V (entrada com pull-up, normal) |
| Terra separado | continuidade preto ESP ↔ preto moto, trecho a trecho; tensão linha 14 ↔ GND do ESP com a moto ligada | bipa; **0,00 V** |
| ESP32 sem energia | 3V3 com a moto ligada | 3,3 V, LED piscando |
| Placa encostada no alumínio do notebook | ESP32 sobre papelão | sem mudança |
| Jumpers / furos | jumpers novos, outro furo, ponta solta | sem mudança; só cai ao ligar no ESP32 |
| ESP32 em si | bancada: 3,3 V do próprio ESP32 no lugar do verde | **R2 = 1,65 V, o ESP32 lê 1,70 V no GPIO34** → placa ok |
| Notebook (terra / ruído pelo USB) | ESP32 no USB da moto e depois num power bank | sem mudança (0,46 V) |
| Oscilação lenta | multímetro em V~ no R2 | 0 V com a moto ligada e desligada |
| Pulsos rápidos | fw 1.4.1: rajada de 2000 leituras em ~87 ms no GPIO34, a cada 2 s | **mín = máx ≈ 0,14 V (piso do ADC), 0 cruzamentos** |

## Conclusão (até aqui)
- O fio verde fica em 5,7 V em vazio e aguenta o divisor de resistores sozinho, mas **com o ESP32 ligado a linha fica
  parada em nível baixo**, sem pulso nem dado nenhum. Com a mesma montagem e uma fonte de 3,3 V, o ESP32 lê
  normalmente. O que muda o comportamento é a linha da moto, não a placa.
- Fica sem explicação a diferença entre o multímetro (0,46 V) e o ADC do ESP32 (~0,14 V) no mesmo ponto. Para
  fechar isso, só um osciloscópio ou um analisador lógico.
- Nenhum byte foi recebido em nenhuma velocidade em nenhuma das tentativas. Isso é coerente com uma **porta de
  programação/diagnóstico que só responde a pedido**, e não com uma saída que transmite sozinha.

## Próximo
1. Foto da etiqueta da controladora (marca/modelo) para identificar o protocolo da porta.
2. Opcional: medir a linha com osciloscópio ou analisador lógico (sem enviar nada).
3. Enviar pedido pela linha é leitura ativa (nível 5) — **decisão do dono**, só com o protocolo identificado.

Ferramentas desta etapa: firmware `esp32-gateway` 1.4.1 (UART2 no GPIO16 com troca de velocidade e rajada no GPIO34),
`scripts/moto/u2-escuta.ps1` e `scripts/moto/linha-ao-vivo.ps1` (painel ao vivo; só leem a serial do ESP32).
