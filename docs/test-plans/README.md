# Plano de testes

## Automatizados
| Comando | Cobertura |
|---|---|
| `npm test` | Vitest — catálogo (ids, hierarquia, sem transmissão por corrente), cobertura (0% medido sem interface), origem (INDISPONÍVEL nunca tem número; desatualizado), estimativas, alertas, simulador (8 cenários, determinismo, isolamento SIMULADO), gateway (recusa), CSV (REAL importado é rebaixado) |
| `npm run e2e` | Playwright smoke — login demo, simulador, Explorador 3D, seleção de componente |
| `npm run lint` / `npm run build` | ESLint + TypeScript estrito + build de produção |

> Antes do primeiro `npm run e2e`: `npx playwright install chromium`.

## Roteiro manual
1. Login demo → Central mostra KPIs **INDISPONÍVEL** (sem números).
2. Laboratório → Iniciar → faixa **MODO SIMULAÇÃO** visível nas telas com dados.
3. Cenário "Temperatura elevada" → alerta em Diagnóstico com origem SIMULADO.
4. Cenário "Gateway desconectado" → leituras ficam **DESATUALIZADO** após ~5 s.
5. Cenário "Falha do BMS" → bateria B desatualizada; eventos registrados.
6. Explorador 3D → vista explodida, ocultar carenagens, transparência, isolar, presets de câmera, modo Sensores (ciano × laranja).
7. Baterias → editar etiqueta; registrar leitura manual e sessão de carga; recarregar e conferir persistência.
8. Configurações → informar consumo (Wh/km) → autonomia deixa de ser INDISPONÍVEL.
9. Relatórios → exportar CSVs; abrir **Relatório técnico** → filtrar período → Gerar PDF (Salvar como PDF).
9b. Manutenção → anexar foto a um serviço/inspeção → miniatura no histórico e no relatório; excluir remove a foto.
9c. Relatórios → Trilha de auditoria registra criar/atualizar/excluir com usuário e horário.
10. Login Firebase (após habilitar Auth) → registros persistem no Firestore por usuário.
