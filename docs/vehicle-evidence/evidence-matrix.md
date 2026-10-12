# Matriz de evidências — Voltz EVS

Status: `documento` · `inspeção` · `hipótese` · `não verificado`.
A versão viva está na aplicação (Manual Técnico → Matriz de evidências), gerada de `src/domain/catalog.ts`.

| Afirmação | Valor atual | Status | Fonte | Observação |
|---|---|---|---|---|
| Motor | Hub na roda traseira, tração direta | hipótese (premissa) | Especificação do proprietário | Confirmar em manual |
| Potência nominal do motor | 3.000 W | hipótese | Pranchas 1/5 | Confirmar etiqueta |
| Nº de baterias | até 2 removíveis | hipótese | Especificação | Confirmar na moto |
| Bateria — tensão | 72 V | hipótese | Especificação | Conferir etiqueta |
| Bateria — capacidade | 33,6 Ah | **conflito** | Especificação × Prancha 5 (50 Ah / 3,6 kWh) | Conferir etiqueta |
| Energia por bateria | ≈ 2,42 kWh | estimado | 72 V × 33,6 Ah | Depende dos dois acima |
| Freio dianteiro | 1 ou 2 discos, CBS | **conflito** | Pranchas divergem; uma cita "ABS (CBS)" | Inspecionar |
| Balança traseira | mono/bibraço | **conflito** | Pranchas divergem | Inspecionar |
| Dimensões | ≈ 2.020 × 780 × 1.070–1.100 mm | hipótese | Pranchas (vistas técnicas) | Altura diverge |
| Pneu dianteiro | 110/70 R17 | hipótese | Prancha 2 | Ler flanco do pneu |
| Painel TFT com Bluetooth/app | — | hipótese | Pranchas | Não presumir API |
| Interface BMS/controladora (CAN/UART/BLE) | — | não verificado | — | **Não presumir** |
| Posição da controladora | — | não verificado | Pranchas divergem | — |
| Carregador on-board | — | não verificado | Prancha 2 | — |

## Referências visuais recebidas
Seis pranchas conceituais (1/5 a 5/5 + um painel composto). Usadas **apenas** como referência de estilo e
organização, nunca como prova de arquitetura mecânica.
