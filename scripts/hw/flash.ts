/**
 * Teste de bancada: grava o firmware com o MESMO código do app (src/integrations/flasher.ts).
 *   npm run hw:flash -- --port COM7 --mode app --version 1.1.0 [--from 1.0.0]
 * Backups e o registro da execução ficam em hw-backups/ (fora do git).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIRMWARE_CATALOG, latestRelease } from '../../src/integrations/firmware';
import { etaSeconds, runFirmwareUpdate, type FlashMode } from '../../src/integrations/flasher';
import { NodePort, arg } from './nodePort';

const root = resolve(import.meta.dirname, '../..');
const port = arg('port');
if (!port) throw new Error('Informe --port (ex.: COM7)');
const mode = arg('mode', 'app') as FlashMode;
const version = arg('version') ?? latestRelease('esp32-gateway')!.version;
const release = FIRMWARE_CATALOG.find((r) => r.name === 'esp32-gateway' && r.version === version);
if (!release) throw new Error(`Versão ${version} não está no catálogo`);
const out = resolve(root, 'hw-backups');
mkdirSync(out, { recursive: true });

let last = '';
const t0 = Date.now();
const run = await runFirmwareUpdate(
  release,
  { mode, backup: true, fromVersion: arg('from'), baudrate: 115200 },
  {
    port: new NodePort(port),
    loadFile: async (p) => new Uint8Array(readFileSync(resolve(root, 'public', p))),
    sha256: async (d) => createHash('sha256').update(d).digest('hex'),
    saveBackup: async (name, data) => {
      writeFileSync(resolve(out, name), data);
      return resolve(out, name);
    },
    onChange: (r) => {
      const s = r.stages.find((x) => x.state === 'executando');
      if (!s) return;
      const pct = s.total ? Math.floor((100 * (s.done ?? 0)) / s.total) : 0;
      const key = `${s.id}|${Math.floor(pct / 10)}`;
      if (key === last) return;
      last = key;
      const eta = etaSeconds(s);
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${secs}s] ${s.label}${s.total ? ` ${pct}%` : ''}${eta != null ? ` ETA ${Math.round(eta)}s` : ''}`);
    },
  },
);
console.log(`\nRESULTADO: ${run.result}${run.error ? ` — ${run.error}` : ''}`);
for (const s of run.stages) {
  const dur = s.startedAt && s.endedAt ? `${((s.endedAt - s.startedAt) / 1000).toFixed(1)}s` : '';
  console.log(`  [${s.state}] ${s.label} ${dur} ${s.detail ? `— ${s.detail}` : ''}`);
}
console.log(run.log.filter((l) => /aviso|✖|placa: #/.test(l)).join('\n'));
writeFileSync(resolve(out, `${run.id}-${mode}-${version}.json`), JSON.stringify(run, null, 2));
process.exit(run.result === 'sucesso' ? 0 : 1);
