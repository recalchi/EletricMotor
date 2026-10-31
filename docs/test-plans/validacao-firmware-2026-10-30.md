# Validação em hardware — atualização de firmware pelo app (30/10/2026)

Placa: ESP32-D0WD-V3 rev 3.1, flash 4 MB, ponte USB CP2102 (COM7), MAC b4:bf:e9:32:1b:dc.
Código testado: `src/integrations/flasher.ts` (o mesmo do app), executado no PC por Node com uma porta serial que
imita a API Web Serial. O caminho no celular (USB OTG, plugin nativo) **não** foi testado em hardware.

| Teste | Modo | Resultado | Tempo |
|---|---|---|---|
| ESP-AT de fábrica → gateway 1.0.0 | completa | 8 etapas OK; falhou só a escuta final (corrigida — ver abaixo) | 206 s |
| gateway 1.0.0 → gateway 1.0.0 | app | **9/9 etapas OK**, anúncio `# fw … 1.0.0` 0,4 s após reiniciar | 183 s |

Em ambos o backup (≈ 1,3 MB, blocos conferidos pelo MD5 do chip) teve falhas pontuais de leitura que se recuperaram
na nova tentativa; a gravação foi conferida pelo MD5 do chip contra o catálogo.

## Incidente e correções

1. **Flash apagada durante um backup que falhou (1ª tentativa, código anterior).** Nenhuma etapa de gravação rodou,
   mas o backup seguinte leu a flash inteira como `0xFF` (confirmado pelo MD5 do chip). Causa: na leitura o esptool-js
   confirma cada pacote enviando o total recebido; com pacotes perdidos pela ponte CP2102 o stub sai da leitura e uma
   confirmação atrasada vira comando — `0xD000` bytes forma `00 D0 00 00` = **ERASE_FLASH**. Correções: blocos de
   16 KB (confirmações ≤ `0x4000`, nunca 0xD0–0xD3 — teste em `flasher.test.ts`), espera de 8 s em vez de 100 s e
   reinício completo da placa no modo de gravação antes de cada nova tentativa. A placa não se danificou (carregador em
   ROM); o ESP-AT de fábrica continua salvo em `E:\DevTools\esp32-backups\backup_esp-at_b4bfe9321bdc_leitura1.bin`.
2. **Anúncio da versão perdido.** O app agora reinicia a placa (pulso em EN pelo RTS) já com a porta de escuta aberta.
3. **Leitura da tabela de partições** passou a ser conferida pelo MD5 do chip (uma leitura veio corrompida).
4. **Velocidade:** só 115200 foi validada; a opção 460800 foi retirada da tela.

Estado final da placa: **esp32-gateway 1.0.0**, boot limpo (`# sensor DS18B20 desconectado` — sensor ainda não ligado).
