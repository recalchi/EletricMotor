import { CATALOG } from './catalog';
import type { CoverageLevel, VehicleComponent } from './types';

export const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  medido: 'Medido diretamente',
  estimado: 'Estimado',
  inspecao_manual: 'Inspeção manual',
  nao_coberto: 'Não coberto',
};

export interface CoverageSummary {
  total: number;
  counts: Record<CoverageLevel, number>;
  /** % de componentes com medição direta — hoje 0% até uma interface ser validada. */
  measuredPercent: number;
}

export function coverageSummary(items: VehicleComponent[] = CATALOG): CoverageSummary {
  const counts: Record<CoverageLevel, number> = { medido: 0, estimado: 0, inspecao_manual: 0, nao_coberto: 0 };
  for (const x of items) counts[x.coverage]++;
  return { total: items.length, counts, measuredPercent: Math.round((counts.medido / items.length) * 100) };
}

/**
 * Cobertura efetiva considerando adaptadores conectados: só vira "medido" se houver amostra REAL recente
 * para o componente. A simulação NUNCA eleva a cobertura.
 */
export function effectiveCoverage(c: VehicleComponent, componentsWithRealData: Set<string>): CoverageLevel {
  if (componentsWithRealData.has(c.id)) return 'medido';
  return c.coverage === 'medido' ? 'nao_coberto' : c.coverage;
}
