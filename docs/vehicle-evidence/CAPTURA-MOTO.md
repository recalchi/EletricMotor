# Captura na moto — roteiro para o agente do notebook

> **Para o agente (Claude Code no notebook):** siga este arquivo do começo ao fim. Seu trabalho é **coletar evidências
> por recepção** quando o dono ligar a moto, gerar o relatório e entregá-lo pela nuvem. Você **não** conecta nada à
> moto, **não** envia comandos a aparelhos da moto e **não** tenta ler/decodificar protocolos proprietários. A análise
> e as atualizações do app ficam com a sessão principal (no PC), que lê o que você entregar.

## Objetivo
Descobrir, sem tocar na moto, o que ela expõe e que poderia levar informações do painel (bateria %, velocidade, km,
autonomia) para o app:
1. **Bluetooth LE** — algum aparelho da moto (painel/TFT, BMS, controladora, trava) anuncia algo quando ela liga?
2. **Bluetooth clássico** — o painel aparece para parear (pelo celular)?
3. **Porta USB da moto** — só energia, ou troca dados?
4. **O que o painel mostra** — a lista de grandezas que queremos espelhar no app (fotos + notas).

## Segurança (obrigatório)
- **Nunca ligue o notebook na entrada USB da moto.** A porta da moto fornece 5 V e a do notebook também: um cabo
  entre as duas põe duas fontes em conflito e pode queimar uma das portas. Para testar a porta da moto use **o
  celular** com o cabo normal dele (ou um medidor USB).
- Não abrir tampas, não desconectar chicotes, não mexer em bateria/BMS/controladora (alta tensão ~72 V).
- Moto parada, no cavalete; não andar durante a captura.
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
| 0 | notebook a 1–2 m da moto; moto **desligada** | `powershell -ExecutionPolicy Bypass -File scripts/moto/usb-snapshot.ps1 -Fase antes` |
| 1 | não mexe na moto (60 s) | `... scripts/moto/ble-scan.ps1 -Fase base -Segundos 60` |
| 2 | **liga a moto** logo depois de o comando começar (45 s) | `... scripts/moto/ble-scan.ps1 -Fase ligando -Segundos 45` |
| 3 | moto ligada, painel aceso; pode navegar pelas telas do painel (120 s) | `... scripts/moto/ble-scan.ps1 -Fase ligada -Segundos 120` |
| 4 | **desliga a moto** logo depois de o comando começar (30 s) | `... scripts/moto/ble-scan.ps1 -Fase desligando -Segundos 30` |
| 5 | — | `... scripts/moto/usb-snapshot.ps1 -Fase depois` |

`...` = `powershell -ExecutionPolicy Bypass -File`. Os comandos param sozinhos no tempo indicado.

### Testes com o celular (o dono faz; o agente anota)
Copie `scripts/moto/notas-modelo.md` para `hw-logs/moto/<data>/notas.md` e preencha com o que o dono disser:
1. **Scanner do app** (APK → Scanner automático) com a moto **ligada**, celular a ~1 m, com "Enviar para a nuvem"
   ligado. O resultado vai para o Firestore da conta do dono (a sessão principal baixa com `npm run scans:pull`).
2. **Bluetooth clássico:** Configurações de Bluetooth do celular → "dispositivos disponíveis" com a moto ligada. Anote os
   nomes que aparecem (não parear nada).
3. **Porta USB da moto:** plugar o **celular** com o cabo normal. Anote se só carrega ou se aparece "Transferir
   arquivos / USB conectado a…". Se houver medidor USB, anote tensão, corrente e protocolo.
4. **Painel:** liste tudo o que ele mostra (bateria %, velocidade, km, autonomia, modos, ícones — inclusive ícone de
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
- Decide o próximo caminho para espelhar o painel no app. Caminhos seguros conhecidos: Bluetooth anunciado
  publicamente (se existir e houver documentação/autorização), leitura do painel por câmera (OCR), leituras manuais
  rápidas, gateway próprio com sensores externos. Leitura direta de BMS/controladora continua **bloqueada** sem
  documentação do fabricante.

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| "Bluetooth desligado ou indisponível" | ligar o Bluetooth do Windows; reiniciar o adaptador |
| Nenhum anúncio na fase base | normal em lugar isolado; o importante é a diferença base × ligada |
| `relatorio.ps1` diz "Nada capturado" | rodar com `-Data AAAA-MM-DD` da pasta em `hw-logs\moto\` |
| OneDrive não encontrado | copiar `hw-logs\moto\<data>` para um meio **privado** e avisar o dono |
| Erro de política de execução | sempre usar `powershell -ExecutionPolicy Bypass -File ...` |
