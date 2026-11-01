# Gateway na moto — roteiro para o agente do notebook (1ª integração)

> **Para o agente (Claude Code no notebook):** siga este arquivo do começo ao fim. Hoje o objetivo é levar o **nosso
> gateway** (ESP32 "Faísca", `esp32-hub`, firmware 1.3.0, com o sensor de temperatura DS18B20 já validado na bancada)
> até a moto e provar que ele funciona **lá**: energia, USB, Bluetooth e leitura do sensor com a moto ligada.
> O gateway **não se liga à elétrica da moto** (nada de chicote, BMS, controladora, 72 V). Você só escuta a placa;
> nada é enviado a ela nem à moto. Avise o dono do que fazer **antes** de cada comando e espere a confirmação.

## O que já está provado (01/11/2026) e o que falta
| Item | Situação |
|---|---|
| Gateway na bancada: USB, Bluetooth, firmware 1.3.0, sensor 28-E53ADD1E64FF (26,8 → 34 °C na mão) | ✅ bancada |
| Moto: BLE "EVS" e módulo 4G anunciam, mas não mandam dados sem comando; tomadas USB não trazem dados da moto | ✅ captura de 01/11 |
| **Gateway funcionando na moto** (energia, interferência ao ligar, USB, Bluetooth com o celular) | ⏳ **hoje** |
| Sensor preso no eixo do motor (parte fixa, junto à saída do cabo de fase) | ⏳ depois — exige fixação mecânica |
| Envio pela internet (Wi‑Fi) | ⏳ depois — exige preparo no PC (ver fim) |

## Segurança (obrigatório)
- **Nada ligado à elétrica da moto.** Energia do ESP32 só por: notebook (cabo USB), power bank, ou a **tomada USB da
  moto** usada como carregador comum. Nunca fios no chicote, nunca 72 V.
- Moto **no cavalete, parada**. Não andar com o gateway nesta etapa.
- A protoboard e os fios ficam **dentro do compartimento ou sob o banco**, longe da roda, do disco e da corrente/
  correia; prenda com fita para não balançar. O sensor fica na própria protoboard (mede o ar do compartimento) — prendê-lo
  no eixo é outra etapa.
- Não ligue o notebook na tomada USB da moto (duas fontes de 5 V). O cabo do notebook vai **só no ESP32**.

## O que levar
- ESP32 com a protoboard **como está na bancada** (sensor, resistor e 3 jumpers — não desmonte).
- Cabo USB **de dados** (o mesmo que funciona no PC), fita isolante/crepe.
- Notebook com Bluetooth ligado e bateria carregada; celular com o **APK EletricMotor 0.8.8**, logado.
- Opcional: power bank com cabo para o ESP32.

## Preparação (no notebook, antes de descer)
```powershell
cd EletricMotor; git pull
# ESP32 plugado no notebook — teste de 20 s em casa:
powershell -ExecutionPolicy Bypass -File scripts/moto/gateway-log.ps1 -Fase casa -Segundos 20
```
Deve mostrar `Firmware: 1.3.0`, `Sensor de temperatura: ok` e mensagens sem perdas. Se disser "Placa não encontrada",
troque o cabo (cabo só de carga não serve) ou instale o driver CP210x (Silicon Labs).

## Execução na moto
`...` = `powershell -ExecutionPolicy Bypass -File`. Os comandos param sozinhos no tempo indicado.

| # | Dono faz | Agente roda |
|---|---|---|
| 1 | gateway no compartimento, cabo até o notebook; moto **desligada** | `... scripts/moto/gateway-log.ps1 -Fase base -Segundos 60` |
| 2 | (mesma posição) | `... scripts/moto/ble-scan.ps1 -Fase gateway -Segundos 30` — deve aparecer o **esp32-hub** junto com o "EVS" |
| 3 | **liga a moto** logo depois de o comando começar | `... scripts/moto/gateway-log.ps1 -Fase ligando -Segundos 45` |
| 4 | moto ligada. **No celular:** app → Conectividade → Gateway Bluetooth → **Conectar** → esp32-hub. Deixe conectado | `... scripts/moto/gateway-log.ps1 -Fase ligada -Segundos 180` (o resumo deve dizer "Bluetooth com cliente: sim") |
| 5 | no app: **Conectividade → bateria de testes → Exportar relatório** e guarde o arquivo | — |
| 6 | **Scanner automático** do app 0.8.8 com envio automático (toque uma vez só) | — |
| 7 | **energia pela moto** (opcional): tire o cabo do notebook e ligue o ESP32 na **tomada USB do guidão** (ou power bank). No celular, o app deve continuar recebendo por Bluetooth por 2 min — anote se caiu | — |
| 8 | volte o cabo para o notebook; **desliga a moto** logo depois de o comando começar | `... scripts/moto/gateway-log.ps1 -Fase desligando -Segundos 30` |

O que observar (o resumo de cada fase já calcula):
- **Reinícios da placa: nenhum** nas fases 3–4 e **perdidas ≤ 2 %** das mensagens → ligar a moto não reinicia nem
  atrapalha o gateway. (Na bancada, 01/11, sai ~1 mensagem corrompida a cada 50–100 pelo próprio cabo/driver — isso
  é normal; muitas perdidas ou um reinício bem na hora de ligar a moto é o que importa.)
- "Ecos do driver descartados" no resumo é normal: o driver da porta repete o resto da sessão anterior ao abrir; o
  script ignora isso.
- **t1** coerente com o ambiente (sobe devagar perto do motor/sol) e `Sensor de temperatura: ok`.
- **Bluetooth com cliente: sim** na fase 4 → o celular recebe o gateway ao lado da moto ligada.

## Notas (o agente preenche em `hw-logs/moto/<data>/notas-gateway.md`)
- Onde o gateway ficou (compartimento/sob o banco), como foi preso, distância até o celular.
- Fase 7: tomada usada, se o ESP32 ligou (LED), se o Bluetooth continuou e por quanto tempo.
- Qualquer queda, reinício ou valor estranho, com a hora.

## Relatório e entrega
```powershell
powershell -ExecutionPolicy Bypass -File scripts/moto/relatorio.ps1
```
Isso copia **toda** a pasta `hw-logs/moto/<data>/` (inclui `gateway-*.log`, `gateway-resumo.md` e as notas) para o
OneDrive privado `EletricMotor-capturas\<data>\`. Coloque lá também o relatório exportado do app (fase 5).

Versão pública: copie o resumo do gateway (não tem dado pessoal) e abra um PR:
```powershell
copy hw-logs\moto\<data>\gateway-resumo.md docs\vehicle-evidence\capturas\<data>-gateway.md
git checkout -b captura/gateway-<data>
git add docs/vehicle-evidence/capturas/<data>-gateway.md docs/vehicle-evidence/capturas/<data>.md
git commit -m "gateway na moto <data> (somente recepção)"
git push -u origin captura/gateway-<data>
gh pr create --fill
```
Ao terminar, diga ao dono: "gateway testado — OneDrive EletricMotor-capturas\<data> e PR captura/gateway-<data>".

## Depois (não fazer hoje)
- **Sensor no eixo:** fixar o DS18B20 (versão à prova d'água) na parte **fixa** do eixo do motor hub, cabo preso
  longe da roda e do disco, passando até o gateway sob o banco.
- **Wi‑Fi:** o firmware já sabe enviar pela internet, mas vem desligado. Para ligar, o dono preenche no **PC** o
  arquivo `firmware/esp32-gateway/secrets.h` (rede do roteador ou do roteador do celular e o token gerado em
  Conectividade → Dispositivos → Gerar token) — senha **nunca** no chat nem no git — e a sessão principal compila e
  grava. Até lá, USB e Bluetooth bastam.
- **Fixação definitiva e alimentação:** caixa vedada sob o banco, energia da tomada USB da moto ou bateria própria —
  nunca da alta tensão.
