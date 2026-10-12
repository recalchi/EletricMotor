// Baixa os scans enviados pelo app (Firestore users/{uid}/scans) para scans-inbox/, para análise local.
// Uso:  npm run scans:pull            (últimos 10)
//       npm run scans:pull -- 30      (últimos 30)
// Credencial: conta de serviço do Firebase (JSON) FORA do repositório. Caminho padrão:
//   D:\DevTools\keys\eletricmotorz-admin.json  — ou defina GOOGLE_APPLICATION_CREDENTIALS.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Reaproveita o firebase-admin já instalado para as Cloud Functions
const require = createRequire(join(root, 'functions', 'package.json'));
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'D:\\DevTools\\keys\\eletricmotorz-admin.json';
if (!existsSync(keyPath)) {
  console.error(`Credencial não encontrada: ${keyPath}
Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada.
Salve o arquivo nesse caminho (fora do repositório) e rode de novo.`);
  process.exit(1);
}
const limit = Number(process.argv[2] ?? 10);

initializeApp({ credential: cert(require(keyPath)) });
const db = getFirestore();
const inbox = join(root, 'scans-inbox');
mkdirSync(inbox, { recursive: true });

const all = [];
for (const user of await db.collection('users').listDocuments()) {
  const snap = await user.collection('scans').get();
  for (const d of snap.docs) all.push({ uid: user.id, ref: d.ref, data: d.data() });
}
all.sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0));

const index = [];
for (const s of all.slice(0, limit)) {
  const dir = join(inbox, s.ref.id);
  mkdirSync(dir, { recursive: true });
  const payload = JSON.parse(s.data.payload ?? '{}');
  writeFileSync(join(dir, 'report.json'), JSON.stringify(payload, null, 2));
  const chunks = await s.ref.collection('chunks').orderBy('n').get();
  writeFileSync(join(dir, 'capture.jsonl'), chunks.docs.map((c) => c.data().jsonl).join('\n') + '\n');
  const row = {
    scanId: s.ref.id,
    uid: s.uid,
    createdAt: s.data.createdAt?.toDate?.().toISOString() ?? null,
    appVersion: s.data.appVersion,
    adverts: s.data.adverts,
    findings: s.data.findings,
    records: s.data.records,
  };
  index.push(row);
  console.log(`✓ ${row.scanId}  ${row.createdAt}  ${row.adverts} BLE · ${row.records} registros`);
}
writeFileSync(join(inbox, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\n${index.length} scan(s) em ${inbox}`);
