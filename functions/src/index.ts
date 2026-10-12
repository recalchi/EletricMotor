/**
 * Cloud Functions do EletricMotor.
 *
 * `ingest` — recebe mensagens EMGP de gateways do proprietário via HTTPS.
 *   POST /ingest
 *   Authorization: Bearer <token do dispositivo>
 *   Content-Type: application/x-ndjson   (uma mensagem por linha, máx. 50 linhas / 64 KB)
 *
 * Segurança:
 *  - token por dispositivo; só o hash SHA-256 fica em deviceIndex/{deviceId} (comparação em tempo constante);
 *  - origem REAL atribuída SOMENTE pelo servidor e somente para dispositivo com status "validado";
 *  - dispositivos em teste vão para deviceTests (não viram telemetria);
 *  - limite de taxa por dispositivo; payload e timestamps validados (EMGP v1).
 *
 * Custos: não grava cada amostra. Mantém o último valor por série (telemetryLatest) e agregados por minuto
 * (telemetryAggregates: min/máx/soma/contagem).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type { DeviceProfile, TelemetrySample } from './shared/domain/types';
import { mapMessage } from './shared/integrations/mapping';
import { parseEmgpLine, type EmgpMessage } from './shared/integrations/protocol';

initializeApp();
const db: Firestore = getFirestore();

const PARSER_VERSION = 'ingest-1.0.0';
const MAX_BODY = 64 * 1024;
const MAX_LINES = 50;
const MIN_INTERVAL_MS = 1000;

const sha256 = (t: string) => createHash('sha256').update(t).digest();

function safeEqualHex(a: Buffer, hex: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const seriesKey = (s: TelemetrySample) => `${s.componentId}__${s.quantity}`;
const minuteKey = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace(/[-:T]/g, ''); // yyyyMMddHHmm

export const ingest = onRequest({ region: 'us-central1', maxInstances: 10, cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'use POST' });
    return;
  }
  const auth = req.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'token ausente' });
    return;
  }
  const body = req.rawBody?.toString('utf8') ?? '';
  if (!body || body.length > MAX_BODY) {
    res.status(413).json({ error: 'corpo vazio ou maior que 64 KB' });
    return;
  }

  const now = Date.now();
  const lines = body
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, MAX_LINES);
  const msgs: EmgpMessage[] = [];
  const errors: string[] = [];
  lines.forEach((l, i) => {
    const r = parseEmgpLine(l, now);
    if (r.ok) msgs.push(r.msg);
    else errors.push(`linha ${i + 1}: ${r.error}`);
  });
  if (!msgs.length) {
    res.status(400).json({ error: 'nenhuma mensagem válida', errors });
    return;
  }
  const dev = msgs[0].dev;
  if (msgs.some((m) => m.dev !== dev)) {
    res.status(400).json({ error: 'uma requisição deve conter um único dispositivo' });
    return;
  }

  // Autenticação do dispositivo
  const idxRef = db.doc(`deviceIndex/${dev}`);
  const idx = await idxRef.get();
  const idxData = idx.data() as
    | { uid: string; vehicleId: string; tokenHash: string; lastIngestAt?: number }
    | undefined;
  if (!idxData || !safeEqualHex(sha256(token), idxData.tokenHash)) {
    logger.warn('ingest: autenticação recusada', { dev });
    res.status(401).json({ error: 'dispositivo ou token inválido' });
    return;
  }
  if (idxData.lastIngestAt && now - idxData.lastIngestAt < MIN_INTERVAL_MS) {
    res.status(429).json({ error: 'muitas requisições — agrupe mensagens (máx. 1 req/s)' });
    return;
  }
  await idxRef.update({ lastIngestAt: now });

  const { uid, vehicleId } = idxData;
  const vehiclePath = `users/${uid}/vehicles/${vehicleId}`;
  const devSnap = await db.doc(`${vehiclePath}/devices/${dev}`).get();
  const device = devSnap.data() as DeviceProfile | undefined;
  if (!device) {
    res.status(404).json({ error: 'cadastro do dispositivo não encontrado' });
    return;
  }

  const real: TelemetrySample[] = [];
  const tests: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  for (const m of msgs) {
    const r = mapMessage(m, device, vehicleId, now, PARSER_VERSION);
    warnings.push(...r.warnings);
    if (r.origin === 'REAL') real.push(...r.samples.filter((s) => s.quality !== 'invalida'));
    else
      tests.push({
        at: now,
        dev,
        seq: m.seq,
        ch: m.ch,
        samples: r.samples,
        unmapped: r.unmapped,
        warnings: r.warnings,
      });
  }

  // Modo teste: somente registro para conferência
  if (tests.length) {
    const batch = db.batch();
    tests.forEach((t) => batch.set(db.collection(`${vehiclePath}/deviceTests`).doc(), t));
    await batch.commit();
  }

  if (real.length) {
    // Último valor por série (o mais recente vence)
    const latest = new Map<string, TelemetrySample>();
    for (const s of real) {
      const k = seriesKey(s);
      const cur = latest.get(k);
      if (!cur || s.timestamp >= cur.timestamp) latest.set(k, s);
    }
    const batch = db.batch();
    latest.forEach((s, k) => batch.set(db.doc(`${vehiclePath}/telemetryLatest/${k}`), { ...s, receivedAt: now }));
    await batch.commit();

    // Agregados por minuto (transação por documento de minuto)
    const byMinute = new Map<string, TelemetrySample[]>();
    for (const s of real) {
      const mk = minuteKey(s.timestamp);
      byMinute.set(mk, [...(byMinute.get(mk) ?? []), s]);
    }
    for (const [mk, samples] of byMinute) {
      const ref = db.doc(`${vehiclePath}/telemetryAggregates/${mk}`);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const series = (snap.get('series') ?? {}) as Record<
          string,
          { min: number; max: number; sum: number; count: number; unit: string; componentId: string; quantity: string }
        >;
        for (const s of samples) {
          const k = seriesKey(s);
          const a = series[k];
          series[k] = a
            ? {
                ...a,
                min: Math.min(a.min, s.value),
                max: Math.max(a.max, s.value),
                sum: a.sum + s.value,
                count: a.count + 1,
              }
            : {
                min: s.value,
                max: s.value,
                sum: s.value,
                count: 1,
                unit: s.unit,
                componentId: s.componentId,
                quantity: s.quantity,
              };
        }
        tx.set(ref, { minute: mk, series, origin: 'REAL', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    }
  }

  res.status(200).json({
    mode: device.status === 'validado' ? 'real' : 'teste',
    accepted: msgs.length,
    realSamples: real.length,
    testMessages: tests.length,
    errors,
    warnings: warnings.slice(0, 20),
  });
});
