import { describe, expect, it } from 'vitest';
import { chunkLines } from './cloudReport';

describe('envio de scan — divisão em pedaços', () => {
  it('respeita o limite de bytes e preserva todas as linhas', () => {
    const lines = Array.from({ length: 50 }, (_, i) => JSON.stringify({ i, data: 'x'.repeat(100) }));
    const chunks = chunkLines(lines, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(new Blob([c]).size).toBeLessThanOrEqual(1000));
    expect(chunks.join('\n').split('\n')).toEqual(lines);
  });
  it('lista vazia gera zero pedaços', () => {
    expect(chunkLines([])).toEqual([]);
  });
});
