// Copia o código de domínio/protocolo puro do app para as Cloud Functions (deploy envia só functions/).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['src/domain/types.ts', 'src/integrations/protocol.ts', 'src/integrations/mapping.ts'];
for (const f of files) {
  const dest = resolve(root, 'functions/src/shared', f.replace(/^src\//, ''));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(resolve(root, f), dest);
}
console.log(`sync-shared: ${files.length} arquivos copiados para functions/src/shared`);
