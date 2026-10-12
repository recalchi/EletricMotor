import type { DataOrigin, Quantity, TelemetrySample } from '../domain/types';

const HEADER = [
  'timestamp_utc',
  'vehicleId',
  'componentId',
  'sensorId',
  'quantity',
  'value',
  'unit',
  'origin',
  'quality',
  'parserVersion',
  'deviceId',
] as const;

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

export function samplesToCsv(samples: TelemetrySample[]): string {
  return toCsv(
    samples.map((s) => ({ ...s, timestamp_utc: new Date(s.timestamp).toISOString() })),
    [...HEADER],
  );
}

/**
 * Importação manual de CSV (mesmas colunas da exportação). A origem informada no arquivo é
 * rebaixada: dados importados manualmente nunca viram REAL sem validação do adaptador.
 */
export function parseSamplesCsv(text: string): { samples: TelemetrySample[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/);
  const errors: string[] = [];
  const head =
    lines
      .shift()
      ?.split(',')
      .map((h) => h.trim()) ?? [];
  const idx = (k: string) => head.indexOf(k);
  const required = ['timestamp_utc', 'componentId', 'quantity', 'value', 'unit'];
  for (const r of required) if (idx(r) < 0) errors.push(`Coluna obrigatória ausente: ${r}`);
  if (errors.length) return { samples: [], errors };

  const samples: TelemetrySample[] = [];
  lines.forEach((line, i) => {
    const cols = line.split(',');
    const ts = Date.parse(cols[idx('timestamp_utc')]);
    const value = Number(cols[idx('value')]);
    if (Number.isNaN(ts) || Number.isNaN(value)) {
      errors.push(`Linha ${i + 2}: timestamp ou valor inválido`);
      return;
    }
    const origin = (cols[idx('origin')] as DataOrigin) || 'ESTIMADO';
    samples.push({
      vehicleId: cols[idx('vehicleId')] || 'evs-1',
      componentId: cols[idx('componentId')],
      sensorId: cols[idx('sensorId')] || 'manual-import',
      quantity: cols[idx('quantity')] as Quantity,
      value,
      unit: cols[idx('unit')],
      timestamp: ts,
      origin: origin === 'REAL' ? 'ESTIMADO' : origin,
      quality: 'suspeita',
      validForMs: 0,
      parserVersion: 'csv-1.0.0',
      deviceId: 'manual-import',
    });
  });
  return { samples, errors };
}

/** Salva/compartilha um arquivo (navegador: download; APK: compartilhamento do Android). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  void import('../platform/files')
    .then((m) => m.saveTextFile(filename, text, mime))
    .catch((e) => import('../app/diagnostics').then((d) => d.reportError('exportacao', e, { arquivo: filename })));
}
