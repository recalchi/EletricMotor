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
5. **Configurar adaptador/gateway** — implementar `TelemetryAdapter` (`src/integrations/adapter.ts`) com versão, grandezas e unidades.
6. **Testar somente leitura** — coerência, latência, falhas. O contrato não tem métodos de escrita.
7. **Mapear telemetria a componentes** — `componentId` + `quantity` + unidade; calibrar quando aplicável.
8. **Conferir histórico e alertas** — relógio UTC, perdas de conexão, dados desatualizados, valores inválidos.
9. **Acompanhamento habitual** — dashboard, tendências, inspeções, exportações com origem.

**Sem hardware** sempre há rota útil: leituras manuais do painel, sessões de carga, inspeções, manutenção e simulador.
