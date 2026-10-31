# Suíte de testes

Toda mudança entra com teste. A regra vale para código, firmware e catálogo: **se não há teste que falharia sem a
mudança, a mudança não está pronta.** O CI (`.github/workflows/ci.yml`) roda as camadas 1 e 2 em todo push e PR; as
camadas 3 e 4 são rodadas na bancada e registradas no PR (`.github/pull_request_template.md`).

## Camadas

| # | Camada | Comando | Onde roda | O que cobre |
|---|---|---|---|---|
| 1 | Unitários | `npm test` | CI + local | domínio, protocolo EMGP, adaptadores, gravador de firmware (etapas, eFuses, partições, ETA, erros), bateria de testes do gateway |
| 2 | Estáticos | `npm run lint` · `npm run build` | CI + local | ESLint, TypeScript estrito, build de produção |
| 2b | Catálogo de firmware | parte de `npm test` (`firmware.catalog.test.ts`) | CI + local | versão do `.ino` = última do catálogo; cada arquivo em `public/firmware` confere SHA-256, MD5 e tamanho |
| 3 | Bancada (hardware) | `npm run hw:monitor -- --port COM7` (ao vivo, só escuta) · `npm run hw:smoke -- --port COM7` · `npm run hw:flash -- --port COM7 --mode app --version X.Y.Z --from A.B.C` | PC com o ESP32 no USB | boot sem pânico, versão anunciada, mensagens EMGP sem perda; atualização com o MESMO código do app |
| 4 | Roteiro manual | ver abaixo | navegador e APK | telas, login, Bluetooth, APK no celular |
| — | E2E | `npm run e2e` (antes: `npx playwright install chromium`) | local | login demo, simulador, Explorador 3D |

## Ao mudar…

| Mudou | Atualize/rode |
|---|---|
| Regras de domínio, catálogo da moto, sensores | `src/domain/domain.test.ts` |
| Protocolo, adaptadores, mapeamento | `src/integrations/*.test.ts` |
| Gravação de firmware (`flasher.ts`) | `flasher.test.ts` **e** camada 3 (`hw:flash` nos modos `app` e `completa`) |
| Firmware (`.ino`) | suba `FW_VERSION`, compile, copie as 4 partes para `public/firmware/esp32-gateway/<versão>/`, inclua no catálogo (`firmware.ts`), rode `npm test` (2b) e a camada 3 |
| Plugin Android / APK / manifesto | `src/platform/android-manifest.test.ts` e camada 4 no celular, itens 11–14 |
| Versão de PC (atalho) | `npm run pc` abre em http://localhost:4173 (recompila se houver mudança) |

### Salvaguardas protegidas por teste — não remover
- **Blocos de leitura ≤ 16 KB** no backup (`READ_CHUNK`): blocos maiores permitem que uma confirmação atrasada vire o
  comando ERASE_FLASH do stub — aconteceu em 30/10/2026 (`validacao-firmware-2026-10-30.md`).
- Conferência por MD5 do chip em cada bloco lido, na tabela de partições e após gravar.
- Nada é gravado se qualquer verificação anterior falhar.
- Confirmação final só com linha `# fw` **completa** da versão esperada.

## Camada 3 — bancada com o ESP32 (só jumpers)
Firmware ≥ 1.1.0 publica sempre, mesmo sem sensor, os canais de bancada:

| Ligação | Canal | Esperado |
|---|---|---|
| GPIO34 → 3V3, depois → GND | `v34` | ~3,1 V e depois ~0 V (solto lê valores aleatórios) |
| GPIO27 → GND | `d27` | solto 1, no GND 0 |
| jumper no GPIO13 + dedo | `tq13` | valor cai bastante ao tocar |
| GPIO4 + resistor 4,7 kΩ → 3V3 + DS18B20 | `t1` | temperatura (quando o sensor chegar) |

Valores reais medidos em 31/10/2026 (placa do projeto, jumper macho-fêmea, protoboard como emenda): v34 = 3,124 V no 3V3
e 0,142 V no GND (piso do ADC calibrado — solto também lê 0,142 V, por isso a ordem 3V3 → GND); d27 = 1 solto, 0 no
GND; tq13 ≈ 1800 solto, ≈ 1390 com jumper pendurado e 450–1060 ao tocar. O pino EN fica ao lado do 3V3: encostar nele
reinicia a placa (inofensivo). Guia ilustrado: `public/guia/testes-jumper.html` (no app: painel "Teste com jumpers").

No app: Conectividade → **Assistente do gateway ESP32** mostra cada verificação, o próximo passo e exporta o relatório.

## Acompanhamento ao vivo (versão de PC)
A porta USB só aceita um programa por vez. Para acompanhar um teste sem disputar a porta com o app:
- abra o app pelo atalho **EletricMotor (bancada USB)** (`scripts/pc/EletricMotor-PC.cmd -Usb`): vai direto ao
  assistente e conecta sozinho à porta já autorizada no Chrome (`/conectividade?auto=usb`);
- tudo o que o assistente vê (mensagens, linhas `#` da placa, verificações que mudam, erros, log da gravação de
  firmware) é gravado em `hw-logs/app-live-AAAAMMDD.log` pelo servidor local (`tools/liveLogPlugin.ts`);
- leia ao vivo com `curl -s "http://localhost:4173/__live/log?tail=50"` (só aceita o próprio PC; nada sai da máquina).
- Sem o app aberto, `npm run hw:monitor -- --port COM7` escuta a placa direto, com a mesma lógica.
- Abrir a porta pelo Chrome reinicia a placa (DTR/RTS): isso derruba uma conexão Bluetooth ativa no celular.

## Captura na moto (evidências, somente recepção)
Roteiro para o agente/notebook: [`docs/vehicle-evidence/CAPTURA-MOTO.md`](../vehicle-evidence/CAPTURA-MOTO.md) —
escuta Bluetooth LE passiva por fases (base/ligando/ligada/desligando), fotografia USB, notas e relatório com versão
pública mascarada + cópia privada no OneDrive. Um clique: `scripts\moto\Captura-Moto.cmd`.

## Camada 4 — roteiro manual
1. Login demo → Central mostra KPIs **INDISPONÍVEL** (sem números).
2. Laboratório → Iniciar → faixa **MODO SIMULAÇÃO** visível nas telas com dados.
3. Cenário "Temperatura elevada" → alerta em Diagnóstico com origem SIMULADO.
4. Cenário "Gateway desconectado" → leituras ficam **DESATUALIZADO** após ~5 s.
5. Cenário "Falha do BMS" → bateria B desatualizada; eventos registrados.
6. Explorador 3D → vista explodida, ocultar carenagens, transparência, isolar, presets de câmera, modo Sensores. BMS no
   topo de cada bateria; disjuntor embaixo do banco.
7. Baterias → editar etiqueta; leitura manual e sessão de carga; recarregar e conferir persistência.
8. Configurações → informar consumo (Wh/km) → autonomia deixa de ser INDISPONÍVEL.
9. Relatórios → CSVs; Relatório técnico → PDF; fotos em manutenção; trilha de auditoria.
10. Sensores → 3 grupos (existentes · em implantação · sugeridos); detalhe do gateway mostra versão e leitura t1.
11. Conectividade → Assistente: **Conectar USB** (PC: Chrome/Edge; celular: cabo OTG) → firmware, fluxo e testes de
    bancada ficam ✓; **Cadastrar gateway**; Exportar relatório.
12. Conectividade → Assistente: **Conectar Bluetooth** → escolher `esp32-hub` (firmware 1.1.0+) → item Bluetooth ✓.
    No APK, a lista de busca não pode ficar vazia (0.8.0 tinha esse defeito; guarda em `android-manifest.test.ts`).
13. Firmware → versão detectada; atualizar no PC (Chrome/Edge) e conferir tela de progresso, histórico e backup salvo.
    No celular a gravação está marcada como experimental (não validada em hardware).
14. Login Google (APK e web) → registros persistem no Firestore por usuário.
