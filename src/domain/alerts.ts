import type { Alert, AlertRule, TelemetrySample } from './types';

/**
 * Regras padrão. Limiares são ILUSTRATIVOS (para demonstração com simulador) e
 * NÃO representam limites seguros da Voltz EVS.
 */
export const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'bat-a-temp-high',
    name: 'Temperatura elevada — bateria A',
    componentId: 'battery-a',
    quantity: 'temperature',
    op: '>',
    threshold: 50,
    severity: 'aviso',
    enabled: true,
    illustrative: true,
    suggestion: 'Interromper uso/carga, deixar em local ventilado e consultar assistência autorizada.',
  },
  {
    id: 'bat-b-temp-high',
    name: 'Temperatura elevada — bateria B',
    componentId: 'battery-b',
    quantity: 'temperature',
    op: '>',
    threshold: 50,
    severity: 'aviso',
    enabled: true,
    illustrative: true,
    suggestion: 'Interromper uso/carga, deixar em local ventilado e consultar assistência autorizada.',
  },
  {
    id: 'bat-a-soc-low',
    name: 'Carga baixa — bateria A',
    componentId: 'battery-a',
    quantity: 'soc',
    op: '<',
    threshold: 15,
    severity: 'info',
    enabled: true,
    illustrative: true,
    suggestion: 'Planejar recarga.',
  },
  {
    id: 'bat-b-soc-low',
    name: 'Carga baixa — bateria B',
    componentId: 'battery-b',
    quantity: 'soc',
    op: '<',
    threshold: 15,
    severity: 'info',
    enabled: true,
    illustrative: true,
    suggestion: 'Planejar recarga.',
  },
  {
    id: 'motor-temp-high',
    name: 'Temperatura elevada — motor hub',
    componentId: 'hub-motor',
    quantity: 'temperature',
    op: '>',
    threshold: 90,
    severity: 'critico',
    enabled: true,
    illustrative: true,
    suggestion: 'Reduzir carga/velocidade e parar com segurança. Inspeção profissional recomendada.',
  },
  {
    id: 'ctrl-temp-high',
    name: 'Temperatura elevada — controladora',
    componentId: 'motor-controller',
    quantity: 'temperature',
    op: '>',
    threshold: 75,
    severity: 'aviso',
    enabled: true,
    illustrative: true,
    suggestion: 'Reduzir demanda de potência e verificar ventilação da região.',
  },
];

export function violates(rule: AlertRule, value: number): boolean {
  return rule.op === '>' ? value > rule.threshold : value < rule.threshold;
}

/**
 * Avalia uma amostra contra as regras, abrindo/encerrando alertas.
 * Retorna a nova lista de alertas (imutável). Alertas carregam a origem do dado que os disparou.
 */
export function evaluate(sample: TelemetrySample, rules: AlertRule[], alerts: Alert[]): Alert[] {
  if (sample.quality === 'invalida') return alerts;
  let next = alerts;
  for (const rule of rules) {
    if (!rule.enabled || rule.componentId !== sample.componentId || rule.quantity !== sample.quantity) continue;
    const open = next.find((a) => a.ruleId === rule.id && a.endedAt == null && a.origin === sample.origin);
    const bad = violates(rule, sample.value);
    if (bad && !open) {
      next = [
        ...next,
        {
          id: `${rule.id}-${sample.timestamp}`,
          ruleId: rule.id,
          componentId: rule.componentId,
          severity: rule.severity,
          title: rule.name,
          message: `${sample.value.toFixed(1)} ${sample.unit} ${rule.op} ${rule.threshold} ${sample.unit}`,
          origin: sample.origin,
          startedAt: sample.timestamp,
          suggestion: rule.suggestion,
        },
      ];
    } else if (!bad && open) {
      next = next.map((a) => (a === open ? { ...a, endedAt: sample.timestamp } : a));
    }
  }
  return next;
}

export function acknowledge(alerts: Alert[], id: string, at = Date.now()): Alert[] {
  return alerts.map((a) => (a.id === id ? { ...a, acknowledgedAt: at } : a));
}

/** Lembretes por uso/data — REGRA OPERACIONAL, não prova de falha física. */
export function maintenanceDue(
  rule: { everyKm?: number; everyDays?: number },
  last: { date: string; odometerKm: number } | undefined,
  now: { date: Date; odometerKm: number },
): { due: boolean; reason: string } {
  if (!last) return { due: true, reason: 'Sem registro anterior' };
  if (rule.everyKm && now.odometerKm - last.odometerKm >= rule.everyKm)
    return { due: true, reason: `${now.odometerKm - last.odometerKm} km desde o último registro` };
  if (rule.everyDays) {
    const days = Math.floor((now.date.getTime() - new Date(last.date).getTime()) / 86400000);
    if (days >= rule.everyDays) return { due: true, reason: `${days} dias desde o último registro` };
  }
  return { due: false, reason: 'Dentro do intervalo' };
}
