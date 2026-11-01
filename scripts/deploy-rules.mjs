// Publica firestore.rules no projeto (sem firebase-tools): mostra se a versão publicada difere da do repositório.
// Uso:  npm run rules:check     (só compara)
//       npm run rules:deploy    (publica se diferente)
// Credencial: a mesma do scans:pull (conta de serviço FORA do repositório).
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'D:\\DevTools\\keys\\eletricmotorz-admin.json';
if (!existsSync(keyPath)) {
  console.error(`Credencial não encontrada: ${keyPath}`);
  process.exit(1);
}
initializeApp({ credential: cert(require(keyPath)) });
const rules = getSecurityRules();
const local = readFileSync(join(root, 'firestore.rules'), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n').trim();

let published = '';
try {
  const rs = await rules.getFirestoreRuleset();
  published = rs.source.map((f) => f.content).join('\n');
  console.log(`Publicado: ruleset ${rs.name} de ${rs.createTime}`);
} catch (e) {
  console.log(`Nenhuma regra publicada ou sem acesso: ${e.message}`);
}
const same = norm(published) === norm(local);
const hasScans = /match \/scans\/\{scanId\}/.test(published);
console.log(`Repositório × publicado: ${same ? 'iguais' : 'DIFERENTES'} · publicado tem regra de scans: ${hasScans ? 'sim' : 'não'}`);

if (process.argv.includes('--deploy') && !same) {
  const r = await rules.releaseFirestoreRulesetFromSource(local);
  console.log(`✓ Publicado: ruleset ${r.name} (${r.createTime})`);
}
