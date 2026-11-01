import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../data/firebase';
import {
  APP_VERSION,
  environmentInfo,
  flushCapture,
  readSession,
  useDiag,
  type CaptureRecord,
} from '../../app/diagnostics';
import { useScan } from './autoScan';

/**
 * Envio do resultado de um scan para análise (Firestore do próprio usuário).
 * - users/{uid}/scans/{scanId}             → resumo + conclusões + ambiente (campo `payload` em JSON)
 * - users/{uid}/scans/{scanId}/chunks/{n}  → gravação do scan em JSONL (pedaços de até ~600 KB)
 * Tudo é texto JSON para não esbarrar nas restrições de tipos do Firestore (arrays aninhados, undefined).
 * Só é enviado quando o usuário toca em “Enviar” ou ativa o envio automático.
 */
export const CHUNK_BYTES = 600_000;
/** A regra do Firestore aceita `payload` < 900.000 caracteres; acima disso anúncios/exploração vão para os pedaços. */
export const PAYLOAD_MAX = 850_000;
const AUTO_KEY = 'em:scan-auto-upload';

export function getAutoUpload(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}
export function setAutoUpload(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    /* sem storage */
  }
}

/** Divide linhas JSONL em pedaços que cabem num documento do Firestore. */
export function chunkLines(lines: string[], maxBytes = CHUNK_BYTES): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let size = 0;
  for (const l of lines) {
    const n = new Blob([l]).size + 1;
    if (cur.length && size + n > maxBytes) {
      out.push(cur.join('\n'));
      cur = [];
      size = 0;
    }
    cur.push(n > maxBytes ? l.slice(0, Math.floor(maxBytes / 4)) : l);
    size += Math.min(n, maxBytes);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

export interface UploadResult {
  scanId: string;
  records: number;
  chunks: number;
}

export async function uploadScanReport(note?: string): Promise<UploadResult> {
  if (!db || !auth?.currentUser) throw new Error('Entre com sua conta (Google ou e-mail) para enviar à nuvem.');
  const uid = auth.currentUser.uid;
  const s = useScan.getState();
  if (!s.finishedAt) throw new Error('Nenhum scan concluído para enviar.');

  // Registros da gravação desde o início deste scan
  await flushCapture();
  const session = useDiag.getState().captureSession;
  let records: CaptureRecord[] = [];
  if (session) {
    const since = (s.startedAt ?? 0) - 1000;
    records = (await readSession(session)).filter((r) => r.t >= since);
  }

  const scanId = `${new Date(s.startedAt ?? Date.now()).toISOString().replace(/[:.]/g, '-')}`;
  const payload = {
    appVersion: APP_VERSION,
    ambiente: environmentInfo(),
    nota: note ?? null,
    scan: {
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      error: s.error,
      bonded: s.bonded,
      adverts: s.adverts,
      explored: s.explored,
      usb: s.usb,
      findings: s.findings,
    },
    erros: useDiag.getState().errors.slice(0, 50),
  };
  const lines = records.map((r) => JSON.stringify(r));
  let payloadJson = JSON.stringify(payload);
  if (payloadJson.length > PAYLOAD_MAX) {
    lines.unshift(
      JSON.stringify({ kind: 'scan-adverts', data: payload.scan.adverts }),
      JSON.stringify({ kind: 'scan-explored', data: payload.scan.explored }),
    );
    payloadJson = JSON.stringify({
      ...payload,
      erros: payload.erros.map((e) => ({ ...e, stack: undefined })),
      scan: { ...payload.scan, adverts: [], explored: [], movedToChunks: true },
    });
  }
  const chunks = chunkLines(lines);

  const ref = doc(db, 'users', uid, 'scans', scanId);
  // Firestore aceita até 500 operações por lote; pedaços grandes vão em lotes menores
  // Falha com o código real do Firestore e os tamanhos (antes só "sem permissão", sem pista da causa)
  const fail = async (e: unknown): Promise<never> => {
    const code = (e as { code?: string }).code ?? 'erro';
    // A regra só permite criar: reenviar o mesmo scan dá permission-denied — se já está lá, não é erro
    if (code === 'permission-denied' && (await getDoc(ref).catch(() => null))?.exists())
      throw new Error('Este scan já está na nuvem — não precisa reenviar.');
    throw new Error(`${code} · payload ${Math.round(payloadJson.length / 1024)} KB · ${chunks.length} parte(s) · ${e instanceof Error ? e.message : String(e)}`);
  };
  const first = writeBatch(db);
  first.set(ref, {
    createdAt: serverTimestamp(),
    appVersion: APP_VERSION,
    platform: payload.ambiente.platform,
    findings: s.findings.length,
    adverts: s.adverts.length,
    records: records.length,
    chunkCount: chunks.length,
    payload: payloadJson,
  });
  await first.commit().catch(fail);
  for (let i = 0; i < chunks.length; i += 8) {
    const b = writeBatch(db);
    chunks.slice(i, i + 8).forEach((c, j) => {
      b.set(doc(collection(ref, 'chunks'), String(i + j).padStart(4, '0')), { jsonl: c, n: i + j });
    });
    await b.commit().catch(fail);
  }
  return { scanId, records: records.length, chunks: chunks.length };
}
