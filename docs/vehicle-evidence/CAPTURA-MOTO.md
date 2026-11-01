# Captura na moto — roteiro para o agente do notebook

> **Para o agente (Claude Code no notebook):** siga este arquivo do começo ao fim. Seu trabalho é **coletar evidências
> por recepção** quando o dono ligar a moto, gerar o relatório e entregá-lo pela nuvem. Você **não** conecta nada à
> moto e **não** envia comandos a aparelhos da moto. Na moto você só **grava bruto** (com os bytes em hex, que é o que
> os decodificadores precisam); a **decodificação é feita depois, fora da moto**, pela sessão principal (no PC), com
> repositórios públicos — veja "Decodificação com repositórios públicos".

## Objetivo — três validações + painel e som
Descobrir, sem tocar na moto, o que ela expõe e que poderia levar informações do painel (bateria %, velocidade, km,
autonomia) para o app — e se dá para usar a caixa de som pelo celular:
1. **As duas portas USB da moto** — cada uma: só energia ou troca dados? (teste com o celular, nunca com o notebook)
2. **Bluetooth LE** (notebook) — algum aparelho da moto (painel/TFT, BMS, controladora, módulo 4G) anuncia algo ao ligar?
3. **Bluetooth clássico** (notebook + celular) — o painel aparece como aparelho de áudio/chamadas para parear?
4. **Caixa de som** — pareada como caixa Bluetooth comum, toca o teste (e depois Spotify) pelo celular/notebook?
5. **O que o painel mostra** — a lista de grandezas que queremos espelhar no app (fotos + notas).

## O que já se sabe (pesquisa pública, 31/10/2026 — confirmar na moto)
- **Painel TFT colorido com Bluetooth para o celular:** mostra música/álbum, chamadas, navegação, consumo da bateria em
  tempo real, autonomia, 2 trips, modo de condução, temperatura, hora. Logo, o painel deve se anunciar para
  pareamento — por isso há a fase **pareamento** e a busca de **Bluetooth clássico** (o tipo usado para áudio/chamadas).
  Fontes: [Carpoint](https://www.carpointnews.com.br/avaliacao-voltz-evs-allblack/),
  [TecMundo](https://www.tecmundo.com.br/transportes/240499-voltz-evs-tudo-moto-eletrica-brasileira.htm).
- **Conectividade de fábrica:** GPS + 4G + Bluetooth e um "smart controller" que envia dados para a nuvem da Voltz;
  o app oficial (Minha Voltz/Hello Voltz) mostrava carga, tempo para completar, **SoH, ciclos**, histórico, falhas,
  localização da bateria, km total, autonomia, velocidade e ligar à distância.
  Fonte: [Motociclismo Online](https://motociclismoonline.com.br/especiais/voltz-motors-cria-app-para-conectar-moto-ao-celular/).
  A fabricante passou por dificuldades/falência ([Click Petróleo e Gás](https://en.clickpetroleoegas.com.br/brazilian-electric-motorcycle-once-promised-180-km-range-and-affordable-price-now-faces-uncertain-future-amid-delays-and-manufacturers-bankr-ctl01/)):
  **verifique se o app oficial ainda funciona** — se sim, os dados da sua própria conta (prints) são uma fonte legítima
  de SoH/ciclos para comparar com o nosso app.
- **Tomadas USB:** a EVS Work é descrita com **duas tomadas USB** ([Motoo](https://www.motoo.com.br/voltz-motos-eletricas-evs-ev1-miles-preco-autonomia-ficha-tecnica/));
  uma matéria cita "painel TFT com conexões USB e Bluetooth" ([Duas Rodas](https://www.revistaduasrodas.com.br/noticias/voltz-lanca-moto-eletrica-no-pais-por-r-15-900)).
  Nenhuma fonte diz se trocam dados — por isso o teste com o celular em **cada uma**.
- Ficha: bateria de lítio 72 V / 33,6 Ah / 2,45 kWh por módulo; motor 3 kW (7 kW pico).

## Decodificação com repositórios públicos (análise offline)
Hoje há muita prática pública e aberta para entender o que um aparelho Bluetooth/serial transmite. Usamos isso **sobre
os arquivos já capturados**, sem precisar mexer na moto. O que a captura grava pensando nisso:
- `ble-*.jsonl` guarda, de cada anúncio, o **Manufacturer Data** (company ID + bytes em hex) e o **Service Data**
  (tipos 0x16/0x20/0x21) em hex — exatamente o formato que os decodificadores abertos recebem.
- `bt-classico-*.jsonl` guarda nome e classe do aparelho (áudio, telefone…), que indica o perfil (A2DP/HFP).

Camadas, da mais simples à mais trabalhosa (cada uma só avança se a anterior achou algo):

| Nível | O que é | Ferramenta pública | Onde roda | Risco |
|---|---|---|---|---|
| 1 | **Quem é o fabricante** do chip/aparelho pelo company ID e UUIDs | [Bluetooth SIG Assigned Numbers](https://www.bluetooth.com/specifications/assigned-numbers/) (lista oficial, também em YAML) | PC, offline | nenhum |
| 2 | **Bater o anúncio com decodificadores prontos** (mais de 100 aparelhos BLE conhecidos) | [Theengs Decoder](https://github.com/theengs/decoder) (GPL-3.0; tem o Theengs Explorer, que mostra bruto × decodificado) | PC, offline | nenhum |
| 3 | **Ver o que o app oficial conversa com a moto** — log Bluetooth do **próprio celular** do dono | Android "Registro de espionagem HCI Bluetooth" (Opções do desenvolvedor) + [Wireshark](https://www.wireshark.org/) filtro `btatt`; guia: [Gadgetbridge — Inspect Bluetooth packets](https://gadgetbridge.org/internals/development/bluetooth/) | celular do dono → PC | nenhum para a moto (é o app oficial que conversa, como sempre); o log tem dados privados → só OneDrive |
| 4 | **Comparar com protocolos já documentados pela comunidade**, se o nível 1–3 indicar a família do BMS/controladora | BMS: [syssi/esphome-jbd-bms](https://github.com/syssi/esphome-jbd-bms), [syssi/esphome-jk-bms](https://github.com/syssi/esphome-jk-bms). Controladora: [jackhumbert/fardriver-controllers](https://github.com/jackhumbert/fardriver-controllers) e o fórum [Endless-sphere](https://endless-sphere.com/sphere/threads/fardriver-controller-serial-protocol-reverse-engineering.121825/) (Votol parece usar o mesmo display) | PC, offline | nenhum |
| 5 | **Leitura ativa só-leitura** (conectar e pedir dados com um comando de leitura público) | nRF Connect / nosso gateway ESP32 | moto | **exige decisão do dono** depois dos níveis 1–4; nunca nesta captura |

Regras para essas camadas:
- **Nada de escrita.** Comandos que alteram BMS/controladora/painel (configuração, calibração, firmware) continuam
  **bloqueados**, mesmo que um repositório público os documente.
- **App oficial (APK):** pode-se inspecionar o APK público (ex.: [JADX](https://github.com/skylot/jadx)) só para achar
  UUIDs e o formato das mensagens, para interoperar com a **própria moto**. Não contornar login, não usar a nuvem da
  fabricante fora do app, não copiar código do app para o repositório (que é público) — registrar só as conclusões.
- Nenhum repositório público citado tem a Voltz como alvo (busca em 01/11/2026). Por isso a primeira pergunta é o
  nível 1: **quem fabricou** o módulo Bluetooth/BMS/controladora. Muitas motos usam peças de mercado (JBD, JK, Daly,
  Fardriver, Votol…), e aí o protocolo já costuma estar documentado.
- Logs HCI, APK e capturas brutas **nunca** vão para o git; só as conclusões, sem endereços.

## Resultado da 1ª captura (01/11/2026) e rodada 2
Relatório público: [capturas/2026-11-01.md](capturas/2026-11-01.md). Resumo:
- **Tomada USB do guidão:** troca dados — é o módulo de áudio **JieLi BR21** (placa de som USB + leitor de cartão
  sem mídia + teclas de mídia). Não traz bateria/velocidade.
- **Tomada USB do compartimento** (etiqueta "E6110 BX2 BigCat"): o notebook não viu nenhum aparelho — falta o celular.
- **Bluetooth clássico "VOLTZ":** pareia como fone (A2DP/HFP/AVRCP), mas o som enviado **não saiu** na moto (nem
  por USB). O bipe de ligar pode vir de um buzzer do painel, e não de uma caixa de som.
- **BLE "EVS"** (serviços 0xFFF0/0xFFB0) e **2 módulos "z"+IMEI** (provável 4G): anunciam **igual** com a moto ligada
  ou desligada — nenhum dado sai no anúncio. Company IDs 0x3152 e 0x3130 não são de fabricante registrado (são
  texto ASCII "R1" e "10"), típico de módulos genéricos.
- Na 1ª captura o notebook foi ligado às tomadas da moto (fora do roteiro). Deu certo, mas **na rodada 2 o teste de
  tomada é com o celular**.

Rodada 2 (curta, ~20 min, com o celular; o notebook só se for refazer o áudio):
1. **Tomada do compartimento com o celular:** só carrega, ou o celular mostra opções de USB/aparece algo? Anote.
2. **Som:** com o celular pareado em "VOLTZ", toque música e **aperte o volume + do celular até o máximo** (o
   volume do módulo é separado do volume do Windows). Procure no painel uma tela/menu de **música** e abra-a.
   Ouça perto da moto inteira (pode haver alto-falante escondido). Anote se ao parear sai algum **tom de
   "conectado"** — se sair, existe alto-falante ligado ao módulo.
3. **App oficial + log HCI** (nível 3): se o app ainda abrir, siga o passo 5 de "Testes com o celular". É a
   melhor chance de saber o que o "EVS" transmite.
4. **Celular → Scanner do APK** com "Enviar para a nuvem" (não houve scan do celular na 1ª captura).
5. **Nível 5 (só se o dono decidir):** no celular, app **nRF Connect** → conectar em "EVS" → **apenas listar**
   serviços e características (não tocar em "Write", não ativar notificações) e tirar print. Isso só lê a lista;
   nada é gravado na moto. Sem a decisão explícita do dono, pule.

## Segurança (obrigatório)
- **Nunca ligue o notebook na entrada USB da moto.** A porta da moto fornece 5 V e a do notebook também: um cabo
  entre as duas põe duas fontes em conflito e pode queimar uma das portas. Para testar a porta da moto use **o
  celular** com o cabo normal dele (ou um medidor USB).
- Não abrir tampas, não desconectar chicotes, não mexer em bateria/BMS/controladora (alta tensão ~72 V).
- Moto parada, no cavalete; não andar durante a captura.
- Pareamento só pelo menu normal do celular/Windows, como qualquer caixa de som (uso previsto pelo fabricante). Não
  usar ferramentas de invasão, não forçar PIN, não instalar firmware.
- Só recepção: os scripts usam a escuta passiva do Windows; nada é transmitido para a moto.

## Privacidade
- Os arquivos brutos (`hw-logs/moto/<data>/`) ficam no notebook e na **cópia privada do OneDrive** — nunca no git
  (o repositório é público; `hw-logs/` está no `.gitignore`).
- O relatório público (`docs/vehicle-evidence/capturas/<data>.md`) só lista aparelhos que **surgiram ao ligar a
  moto**, com endereço mascarado. Celulares, relógios e vizinhos (já presentes com a moto desligada) são descartados.
- Não registrar SSIDs de Wi-Fi, localização ou dados pessoais nas notas.

## Preparação (no notebook, antes de descer)
1. Windows 10/11 com **Bluetooth ligado** (Configurações → Bluetooth). Git instalado.
2. Repositório atualizado:
   ```powershell
   git clone https://github.com/recalchi/EletricMotor.git   # se ainda não tiver
   cd EletricMotor; git pull
   ```
3. Teste rápido do Bluetooth (10 s, em casa): deve listar anúncios.
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/moto/ble-scan.ps1 -Fase teste -Segundos 10
   ```
   Se disser "Bluetooth desligado ou indisponível", ligue o Bluetooth e repita.
4. Bateria do notebook carregada; celular com o **APK EletricMotor 0.8.3+**, logado com a conta Google do dono.

## Execução na moto

### Opção A — o dono roda sozinho (um clique)
Duplo clique em `scripts\moto\Captura-Moto.cmd` e siga as instruções na tela. Ele cronometra as fases, abre as notas
no Bloco de Notas e gera o relatório no fim.

### Opção B — o agente conduz (passo a passo)
Rode cada comando, **avise o dono do que fazer antes** e espere ele confirmar. Tempos padrão entre parênteses.

| # | Dono faz | Agente roda |
|---|---|---|
| 0 | notebook a 1–2 m da moto; moto **desligada**; **Bluetooth do celular desligado** (se ele já for pareado, o painel conecta nele e para de anunciar) | `powershell -ExecutionPolicy Bypass -File scripts/moto/usb-snapshot.ps1 -Fase antes` |
| 1 | não mexe na moto (60 s + ~25 s de busca clássica) | `... scripts/moto/ble-scan.ps1 -Fase base -Segundos 60 -Classico` |
| 2 | **liga a moto** logo depois de o comando começar (45 s) | `... scripts/moto/ble-scan.ps1 -Fase ligando -Segundos 45` |
| 3 | moto ligada, painel aceso; pode navegar pelas telas do painel (120 s) | `... scripts/moto/ble-scan.ps1 -Fase ligada -Segundos 120 -Classico` |
| 4 | abre no painel o menu Bluetooth/conectar celular e deixa **procurando/visível** (90 s); sem menu, só espera | `... scripts/moto/ble-scan.ps1 -Fase pareamento -Segundos 90 -Classico` |
| 5 | **teste de som** (opcional): Windows → Bluetooth → Adicionar dispositivo → pareia o nome da moto como caixa de som | `... scripts/moto/audio-teste.ps1 -Fase moto` (frase + 3 bipes; pergunta se saiu pela moto) |
| 6 | **desliga a moto** logo depois de o comando começar (30 s) | `... scripts/moto/ble-scan.ps1 -Fase desligando -Segundos 30` |
| 7 | — | `... scripts/moto/usb-snapshot.ps1 -Fase depois` |

`...` = `powershell -ExecutionPolicy Bypass -File`. Os comandos param sozinhos no tempo indicado.

### Testes com o celular (o dono faz; o agente anota)
Copie `scripts/moto/notas-modelo.md` para `hw-logs/moto/<data>/notas.md` e preencha com o que o dono disser:
1. **Scanner do app** (APK → Scanner automático) com a moto **ligada**, celular a ~1 m, com "Enviar para a nuvem"
   ligado. O resultado vai para o Firestore da conta do dono (a sessão principal baixa com `npm run scans:pull`).
2. **Bluetooth clássico:** Configurações de Bluetooth do celular → "dispositivos disponíveis" com a moto ligada. Anote os
   nomes que aparecem (não parear nada).
3. **As duas portas USB da moto (uma de cada vez):** plugar o **celular** com o cabo normal (que transfere dados) com a
   moto ligada. Para **cada porta** anote: onde fica, tipo (USB-A/USB-C), se o celular só carrega ou se aparece
   "Transferir arquivos / USB conectado a… / Android Auto" e a velocidade de carga que o celular indica. Com medidor
   USB: tensão, corrente e protocolo (QC/PD). Se alguma porta mostrar opções de dados, **não** escolha nada e só anote.
4. **Som pelo celular:** depois de o notebook terminar, ligue o Bluetooth do celular, pareie com a moto (como caixa
   de som) e, no APK, Conectividade → **Som da moto → Tocar som de teste**; depois teste o Spotify. Anote se saiu som,
   a qualidade e se o volume do celular controla.
5. **App oficial:** se ainda tiver o app Minha Voltz/Hello Voltz, abra e anote se funciona (prints na pasta do OneDrive).
   **Se funcionar e falar com a moto por Bluetooth**, faça a gravação do nível 3 (é a evidência mais valiosa):
   1. Celular → Opções do desenvolvedor → **Registro de espionagem HCI Bluetooth** = ativado; desligue e ligue o Bluetooth.
   2. Abra o app oficial, conecte na moto e passe pelas telas de bateria/SoH/ciclos/km **anotando a hora** de cada
      tela e o valor mostrado (é isso que permite achar o número dentro dos bytes depois).
   3. Desative o registro. Gere o arquivo: Opções do desenvolvedor → **Relatório de bug** (o zip contém
      `btsnoop_hci.log`; o caminho muda por aparelho) ou `adb bugreport` no notebook.
   4. Coloque o zip/log **só na pasta do OneDrive** (contém tudo o que o Bluetooth do celular fez) — nunca no git.
6. **Painel:** liste tudo o que ele mostra (bateria %, velocidade, km, autonomia, modos, ícones — inclusive ícone de
   Bluetooth) e os valores no momento. Tire fotos do painel ligado, das etiquetas e da porta USB.

## Relatório e entrega pela nuvem
```powershell
powershell -ExecutionPolicy Bypass -File scripts/moto/relatorio.ps1
```
Gera:
- `hw-logs/moto/<data>/relatorio.md` — completo (local).
- `docs/vehicle-evidence/capturas/<data>.md` — **versão pública**, só candidatos da moto, endereços mascarados.
- Cópia privada de tudo em **OneDrive → `EletricMotor-capturas\<data>\`** (bruto + relatório + notas). Coloque as
  fotos nessa mesma pasta do OneDrive.

Depois, publique só a versão pública num branch e abra um PR:
```powershell
git checkout -b captura/moto-<data>
git add docs/vehicle-evidence/capturas/<data>.md
git commit -m "captura na moto <data> (somente recepção)"
git push -u origin captura/moto-<data>
gh pr create --fill   # se o gh estiver instalado; senão, avise o dono para abrir o PR no GitHub
```
**Não** faça commit de `hw-logs/` nem de fotos. Ao terminar, diga ao dono: "captura entregue — pasta do OneDrive
EletricMotor-capturas\<data> e PR captura/moto-<data>".

## O que a sessão principal faz com isso
- Lê a pasta privada do OneDrive e o PR; baixa o Scanner do celular (`npm run scans:pull`).
- Atualiza a matriz de evidências (`evidence-matrix.md`) e o catálogo de sensores conforme o que foi comprovado.
- Roda a decodificação offline (níveis 1–4 acima): fabricante pelo company ID, Theengs Decoder sobre os hex, Wireshark
  sobre o log HCI (se houver), comparação com os protocolos públicos de BMS/controladora.
- Decide o próximo caminho para espelhar o painel no app. Caminhos seguros conhecidos: anúncio Bluetooth decodificado
  (só recepção), protocolo do app oficial entendido pelo log HCI, leitura do painel por câmera (OCR), leituras manuais
  rápidas, gateway próprio com sensores externos. **Leitura ativa** (nível 5) só com protocolo identificado e
  aprovação do dono; **escrita** em BMS/controladora continua bloqueada.

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| "Bluetooth desligado ou indisponível" | ligar o Bluetooth do Windows; reiniciar o adaptador |
| Nenhum anúncio na fase base | normal em lugar isolado; o importante é a diferença base × ligada |
| `relatorio.ps1` diz "Nada capturado" | rodar com `-Data AAAA-MM-DD` da pasta em `hw-logs\moto\` |
| OneDrive não encontrado | copiar `hw-logs\moto\<data>` para um meio **privado** e avisar o dono |
| Erro de política de execução | sempre usar `powershell -ExecutionPolicy Bypass -File ...` |
| Não há "Opções do desenvolvedor" no celular | Configurações → Sobre o telefone → tocar 7× em "Número da versão" |
| Relatório de bug sem `btsnoop_hci.log` | ligar o registro HCI, **reiniciar o Bluetooth**, repetir a sessão no app e gerar de novo |
