# Manual de integração do proprietário

> Versão interativa: aplicação → **Manual Técnico**.

**Proibido:** escrita em BMS/controladora, bypass de proteções, abrir bateria ou manipular células de lítio,
intervir em freios/segurança sem procedimento aprovado. Alta tensão (~72 V nominal, a confirmar) e altas correntes
podem causar choque, arco elétrico e incêndio.

1. **Identificar a EVS real** — ano, variante, chassi, nº de baterias, fotos de etiquetas, documentos.
   *Estado esperado:* Configurações e Baterias preenchidas com "etiqueta conferida".
2. **Mapear interfaces comprovadas** — documentação + inspeção visual autorizada. Atualizar a matriz de evidências.
3. **Definir a aquisição** — preferir caminhos externos (medidor de tomada, TPMS, sensores com bateria própria).
4. **Validar em bancada / com profissional** — nunca conectar cabos aleatórios nem energizar interfaces desconhecidas.
5. **Configurar adaptador/gateway** — cadastre o dispositivo em **Conectividade → Dispositivos** (ID, transporte,
   canais → componente/grandeza/unidade, calibração). Gateways próprios falam **EMGP v1**
   ([gateway-protocol.md](gateway-protocol.md)); há um firmware de referência em `firmware/esp32-gateway`.
6. **Testar somente leitura** — com o dispositivo em estado *teste*, as leituras aparecem só no **Console de teste**.
   Compare com uma referência independente; confira perdas de sequência e timestamps. Conclua com **Validar**
   (checklist + notas). Só então os dados viram **REAL**. O contrato não tem métodos de escrita.
7. **Mapear telemetria a componentes** — `componentId` + `quantity` + unidade; calibrar quando aplicável.
8. **Conferir histórico e alertas** — relógio UTC, perdas de conexão, dados desatualizados, valores inválidos.
9. **Acompanhamento habitual** — dashboard, tendências, inspeções, exportações com origem.

**Sem hardware** sempre há rota útil: leituras manuais do painel, sessões de carga, inspeções, manutenção e simulador.

## Caminhos de conexão disponíveis

| Caminho | Quando usar | Requisitos |
|---|---|---|
| **USB serial** | gateway próprio ligado ao computador | Chrome/Edge desktop |
| **Bluetooth UART (NUS)** | gateway próprio sem fio, próximo ao computador/celular Android | Chrome/Edge (Web Bluetooth) |
| **Bluetooth ESS** | sensor comercial de temperatura/umidade que segue o perfil padrão *Environmental Sensing* | Chrome/Edge |
| **Internet (HTTPS)** | gateway com Wi-Fi/4G enviando continuamente | login Firebase + função `ingest` implantada |
| **Interface direta da moto** | BMS/controladora | **bloqueada** — nenhuma interface documentada |

## Nuvem — implantar a função de ingestão

> Cloud Functions exigem o plano **Blaze** (pago por uso) no Firebase. Para testar sem custo use o emulador.

```bash
npm --prefix functions install
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,functions
```

Emulador local (sem custo):

```bash
npm --prefix functions run build
npx firebase-tools emulators:start --only functions,firestore
```

Depois: no app (logado no Firebase) cadastre o dispositivo com transporte **Internet**, clique em **Gerar token**,
grave o token no firmware (`secrets.h`) e conecte o adaptador **Nuvem (ingestão HTTPS)**.

O servidor mantém apenas o último valor por série (`telemetryLatest`) e agregados por minuto
(`telemetryAggregates`). Mensagens de dispositivos em teste vão para `deviceTests` — configure uma política de
TTL no Firestore para essa coleção se quiser expiração automática.
