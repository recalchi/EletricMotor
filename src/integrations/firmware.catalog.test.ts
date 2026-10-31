import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRMWARE_CATALOG, latestRelease } from './firmware';
import { filesFor } from './flasher';

/**
 * Guarda estrutural para publicar firmware: o que o app grava tem que ser exatamente o que o catálogo descreve.
 * Ao lançar uma versão: suba FW_VERSION no .ino, compile, copie as 4 partes para public/firmware/<nome>/<versão>/ e
 * acrescente a entrada no catálogo — estes testes falham se algum passo for esquecido.
 */
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p));
const hash = (alg: 'sha256' | 'md5', d: Buffer) => createHash(alg).update(d).digest('hex');

describe('catálogo de firmware × arquivos publicados', () => {
  it('a versão no .ino é a mais nova do catálogo', () => {
    const ino = read('firmware/esp32-gateway/esp32-gateway.ino').toString();
    const v = /#define FW_VERSION "([^"]+)"/.exec(ino)?.[1];
    expect(v).toBe(latestRelease('esp32-gateway')!.version);
  });

  for (const r of FIRMWARE_CATALOG.filter((x) => x.artifacts)) {
    describe(`${r.name} ${r.version}`, () => {
      it('as 4 partes existem e conferem com SHA-256, MD5 e tamanho', () => {
        expect(r.artifacts!.map((a) => a.role)).toEqual(['bootloader', 'particoes', 'otadata', 'app']);
        for (const a of r.artifacts!) {
          const p = `public/${r.path}/${a.file}`;
          expect(existsSync(resolve(root, p)), p).toBe(true);
          const d = read(p);
          expect(d.length, p).toBe(a.size);
          expect(hash('sha256', d), p).toBe(a.sha256);
          expect(hash('md5', d), p).toBe(a.md5);
        }
      });
      it('imagens são ESP32 válidas e o app cabe na partição app0 (1,25 MB)', () => {
        for (const a of filesFor(r, 'completa').filter((x) => x.role === 'app' || x.role === 'bootloader'))
          expect(read(`public/${r.path}/${a.file}`)[0]).toBe(0xe9);
        expect(r.artifacts!.find((a) => a.role === 'app')!.size).toBeLessThanOrEqual(0x140000);
      });
    });
  }
});
