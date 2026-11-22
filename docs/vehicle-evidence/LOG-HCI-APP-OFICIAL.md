# Roteiro: log HCI do app oficial (nível 3)

**Objetivo:** descobrir **o que o app oficial da Voltz conversa com a moto** pelo Bluetooth. O caminho é gravar o
tráfego no próprio celular do dono enquanto o app é usado normalmente. É a forma mais segura de entender o BLE "EVS"
(0xFFF0/0xFFB0), que no scan de 01/11 conectou mas devolveu a lista de serviços vazia.

**Por que é seguro:**
- Quem conversa com a moto é o **app oficial**, como no uso de sempre.
- O Android só **anota** o que passou pelo Bluetooth.
- Nós lemos esse arquivo depois, no computador, sem conectar em nada.

**O que o log responde:**
1. O app fala com a moto por Bluetooth, ou só pela nuvem (módulo 4G "z"+IMEI)?
2. Com qual aparelho ele fala: "EVS", "z…" ou "VOLTZ"?
3. Quais serviços e características GATT existem, e com quais propriedades (leitura, escrita, notificação)?
4. Quais **pedidos** o app faz e quais **respostas** a moto devolve.
5. Em que bytes estão a bateria (%), o odômetro, a autonomia etc. Isso é cruzado com o que o app ou o painel
   mostravam na mesma hora.

Regras que continuam valendo:
- **Nada de escrita nossa na moto.** As escritas que o app oficial faz servem só para entender o protocolo.
- Repetir qualquer pedido do app (nível 5) exige protocolo entendido **e** decisão explícita do dono.
- Comandos de configuração, calibração e firmware ficam bloqueados para sempre.
- O log bruto registra **tudo** o que o Bluetooth do celular fez no período (fones, relógio, carro…). Ele fica
  **só** em `hw-logs/` e no OneDrive, nunca no git. No repositório entram só as conclusões, com endereços mascarados.

---

## Antes de ir para a moto (uma vez só)

1. **Opções do desenvolvedor:** Configurações → Sobre o telefone → Informações do software → toque **7×** em
   "Número de compilação".
2. Em **Configurações → Opções do desenvolvedor**:
   - **Registro de espionagem HCI Bluetooth** (o nome varia; procure por "HCI"): escolha **"Ativado"**.
     **Não** use "Ativado (filtrado)": esse modo corta os bytes das mensagens, e o decodificador avisa quando isso
     acontece.
   - **Depuração USB:** ativada. Só é necessária para puxar o log pelo cabo; dá para fazer sem ela (veja o Passo 4).
3. **Desligue e ligue o Bluetooth** do celular. O registro só começa depois disso.
4. Confira se o app oficial (Hello Voltz / Minha Voltz) abre e se você está logado.
5. Deixe o relógio do celular mostrando os **segundos**, ou use **prints**: o nome do arquivo do print traz a hora exata.
   Prints são o jeito mais fácil.

## Passo 1: preparar (moto ligada, parada)

- Moto **ligada**, painel aceso, no descanso. **Não ande** com a moto durante a gravação com o celular na mão.
- **Feche o app oficial** (Recentes → arrastar para fora) para ele conectar do zero.
- Para o log também trazer a **tabela GATT**, o app precisa fazer a descoberta de novo:
  - Configurações → Apps → app oficial → Armazenamento → **Limpar cache**. **Não** use "limpar dados", que apaga o
    login.
  - Se a moto aparecer como **pareada** nas Configurações de Bluetooth, **não** desfaça o pareamento agora. Só
    anote isso.
- Deixe desligados, se puder, os outros aparelhos Bluetooth do celular (relógio, fone). Isso deixa o log mais limpo.

## Passo 2: gravar a sessão (5 a 10 minutos)

Abra o app oficial e conecte na moto, do jeito normal. Depois passe pelas telas **anotando hora → tela → valor**,
como na tabela abaixo. Um print de cada tela resolve.

| hora (hh:mm:ss) | tela do app | valor mostrado | valor no painel TFT |
|---|---|---|---|
| 14:32:10 | Bateria | 87 % | 87 % |
| 14:33:05 | Odômetro | 1.234,5 km | 1.234 km |
| … | … | … | … |

Dicas para o número aparecer nos bytes:
- Passe por **todas** as telas de leitura: bateria A/B, SoH ou saúde, ciclos, tensão, temperatura, km, autonomia,
  modo, alertas. Fique ~20 s em cada uma.
- O melhor é **um valor que muda** durante a gravação. Três formas boas:
  - grave **com a moto carregando**: a % sobe;
  - **troque o modo** ECO/SPORT/TURBO no punho da moto e anote a hora de cada troca;
  - **desligue e ligue** a chave uma vez.
- Faça **duas sessões** em dias ou momentos diferentes, por exemplo antes e depois de rodar alguns km. Um valor que
  muda nos dois lugares ao mesmo tempo é prova forte.
- Nesta gravação, **não** use funções que mudam algo na moto (travar/destravar, alarme, configurações). Fique só nas
  telas de leitura.
- Se o app **não conectar** por Bluetooth (ou não tiver nada da moto), grave assim mesmo 2 min com ele aberto. O
  log vai mostrar se ele tentou conectar, e isso também é resposta.

No fim, feche o app oficial. **Deixe o registro HCI ligado até tirar o log** (Passo 3 ou 4): em alguns Samsung o
log só entra no relatório de bug enquanto o registro está ativo. Depois, desative-o em Opções do desenvolvedor.

## Passo 3: tirar o log do celular

**Com cabo (mais fácil):** plugue o celular no notebook com um cabo de **dados** e aceite "Permitir depuração USB".
Depois rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/moto/hci-puxar.ps1 -Valores "14:32:10=87,14:33:05=1234.5"
```

O script:
1. gera o **relatório de bug** do Android pelo `adb`, um zip que contém o `btsnoop_hci.log`;
2. guarda tudo em `hw-logs/moto/<data>/hci/`;
3. decodifica o log;
4. faz uma cópia privada no OneDrive (`EletricMotor-capturas/<data>/hci/`).

Sobre o `-Valores`:
- Use as horas e os valores da sua tabela, **com ponto decimal** (`1234.5`) e itens separados por vírgula.
- É opcional: dá para rodar sem ele e passar os valores depois.

## Passo 4: sem cabo (alternativa)

1. Celular → Opções do desenvolvedor → **Relatório de bug** → "Interativo". Espere a notificação, que leva de 1 a
   5 min.
2. Toque na notificação e compartilhe o zip **para você mesmo**: OneDrive, Quick Share para o notebook ou cabo como
   arquivo. Nunca use grupos ou e-mail de terceiros.
3. No notebook:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/moto/hci-puxar.ps1 -Arquivo "C:\caminho\bugreport-....zip" -Valores "14:32:10=87"
```

## O que sai (em `hw-logs/moto/<data>/hci/`)

| arquivo | conteúdo |
|---|---|
| `hci-resumo.md` | Conexões do período (a moto marcada ✅), **tabela GATT** e, por característica, quantas mensagens foram em cada sentido, com exemplos em hex. Lista também as notificações que o app ligou. |
| `hci-linha.csv` | Todas as mensagens com a moto, em ordem: hora, sentido, operação, handle, característica e bytes. |
| `hci-valores.md` | Para cada valor anotado, onde ele aparece nos bytes até ±20 s daquela hora. Testa os formatos comuns: 1/2/4 bytes, ordem normal e invertida, ×10/×100/×1000, BCD e texto. No fim mostra as **posições que se repetem**. |

Para rodar o decodificador direto, por exemplo para trocar a janela de tempo ou o alvo:
```powershell
python -I scripts/moto/hci_decode.py hw-logs/moto/2026-11-22/hci/bugreport.zip --valores "14:32:10=87" --janela 30
```
- `--alvo "AB:CD"` filtra pelo final do endereço, se o nome da moto não aparecer no log.
- `--ajuste-horas -3` corrige o fuso, se as horas do log não baterem com as dos prints.

## Como ler o resultado

- **Há conexão LE com "EVS"**: é o caminho para espelhar o painel no app.
  - Notificações chegando sozinhas depois de o app ligar o CCCD: a moto **transmite** dados, e o EletricMotor
    pode, no futuro, só **ouvir**.
  - Pedidos curtos do app seguidos de respostas: protocolo de **pergunta e resposta**. Repetir os pedidos já é
    nível 5 e depende da decisão do dono.
- **Conexão com "z…" (módulo 4G)**: o app conversa com o rastreador. Os dados provavelmente vêm da telemetria de
  fábrica.
- **Nenhuma conexão com a moto**: o app usa **só a nuvem**. Nesse caso, os caminhos honestos continuam sendo:
  - a Leitura do painel (manual);
  - o gateway próprio com sensores;
  - a inspeção offline do APK público (JADX), para achar UUIDs. Veja [CAPTURA-MOTO.md](CAPTURA-MOTO.md).
- Um número só é **comprovado** quando **acompanha** o valor da tela em mais de uma anotação: mesma
  característica, mesmo byte, mesmo formato. Um acerto isolado de 1 byte pode ser coincidência.

## Entregar para análise

A pasta `hw-logs/moto/<data>/hci/` já fica no notebook e o script copia para o OneDrive. Basta avisar o Claude na
sessão do projeto. Depois da análise, as conclusões, **sem endereços nem IMEI**, vão para:
- [evidence-matrix.md](evidence-matrix.md);
- um relatório em `capturas/<data>-hci.md`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "Nenhum btsnoop no zip" | Registro em **"Ativado"**, **reinicie o Bluetooth**, repita a sessão e gere o relatório de novo. Em alguns Samsung o log só entra no relatório se o registro ainda estiver ligado: gere o relatório **antes** de desativar o registro. |
| "mensagens vieram cortadas" | O registro estava em "Ativado (filtrado)". Troque para "Ativado" e grave de novo. |
| "Nenhuma conexão com a moto" | Veja a tabela de conexões no resumo: se houver uma conexão LE sem nome no horário, rode com `--alvo` e o final do endereço. Se não houver nenhuma, o app não usou o Bluetooth. |
| Tabela GATT vazia | O app usou o cache. Limpe o cache do app (Passo 1) e grave de novo. |
| `adb` diz `unauthorized` | Desbloqueie a tela do celular e aceite "Permitir depuração USB". |
| Horas não batem com os prints | Use `--ajuste-horas` (ex.: `-3` ou `3`). |
