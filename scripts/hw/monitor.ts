/**
 * Monitor ao vivo da bateria de testes pelo USB do PC — só escuta (não reinicia a placa, não grava nada).
 * Usa a MESMA lógica da tela Conectividade → Assistente (bench.ts): mostra cada mensagem e avisa quando uma
 * verificação muda de estado. Grava tudo em hw-logs/monitor-<data>.log.
 *   npm run hw:monitor -- --port COM7 [--seconds 600]   (0 = até Ctrl+C)
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { benchChecks, benchLog, benchMessage, emptyBench, nextStep } from '../../src/integrations/bench';
import { parseFirmwareAnnounce, updateAdvice } from '../../src/integrations/firmware';
import { parseEmgpLine } from '../../src/integrations/protocol';
import { NodePort, arg } from './nodePort';

const path = arg('port');
if (!path) throw new Error('Informe --port (ex.: COM7)');
const seconds = Number(arg('seconds', '0'));
mkdirSync('hw-logs', { recursive: true });
const logFile = `hw-logs/monitor-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.log`;
const out = (s: string) => {
  const line = `${new Date().toLocaleTimeString('pt-BR')} ${s}`;
  console.log(line);
  appendFileSync(logFile, line + '\n');
};

const port = new NodePort(path);
// Se a porta estiver com o app (Chrome/APK), espera ela ser liberada em vez de falhar
for (let i = 0; ; i++) {
  try {
    await port.open({ baudRate: 115200 });
    break;
  } catch (e) {
    if (i === 0) out(`${path} ocupada (${e instanceof Error ? e.message : e}) — desconecte o USB no app; aguardando…`);
    if (i > 300) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
// DTR e RTS juntos não acionam o EN: solta os dois ao mesmo tempo para não reiniciar a placa (nem derrubar o Bluetooth)
await port.setSignals({ dataTerminalReady: false, requestToSend: false });
const reader = port.readable!.getReader();
out(`monitor em ${path} — log em ${logFile}`);

const ctx = { registered: false, validated: false, cloudConnected: false };
let bench = emptyBench();
let prev = new Map(benchChecks(bench, ctx).map((c) => [c.id, c.status]));
const mark = { ok: '✓', pendente: '·', aguardando_hw: '⏳', opcional: '○' } as const;

const handle = (raw: string) => {
  const l = raw.trim();
  if (!l) return;
  if (l.startsWith('#')) {
    const fw = parseFirmwareAnnounce(l) ?? undefined;
    bench = benchLog(bench, l, fw, fw && updateAdvice(fw));
    out(`placa ${l}`);
  } else if (l.startsWith('{')) {
    const r = parseEmgpLine(l);
    if (!r.ok) return out(`inválida: ${r.error}`);
    bench = benchMessage(bench, r.msg, 'serial', Date.now());
    const st = r.msg.st ?? {};
    out(`#${r.msg.seq} ${JSON.stringify(r.msg.ch)} ble=${st.ble} fw=${st.fw ?? '?'} up=${st.up}s`);
  } else out(`placa ${l}`);
  for (const c of benchChecks(bench, ctx)) {
    if (prev.get(c.id) !== c.status) out(`  ${mark[c.status]} ${c.label}: ${c.status} — ${c.detail}`);
  }
  prev = new Map(benchChecks(bench, ctx).map((c) => [c.id, c.status]));
};

const dec = new TextDecoder();
let buf = '';
let lastHint = '';
const end = seconds > 0 ? Date.now() + seconds * 1000 : Infinity;
// a leitura pendente sobrevive ao tempo limite: descartá-la perderia o pedaço que ela trouxer
let pending: ReturnType<typeof reader.read> | null = null;
while (Date.now() < end) {
  pending ??= reader.read();
  const timer = new Promise<'t'>((res) => setTimeout(() => res('t'), 1000));
  const r = await Promise.race([pending, timer]);
  if (r !== 't') {
    pending = null;
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true });
    const parts = buf.split(/\r?\n/);
    buf = parts.pop()!;
    parts.forEach(handle);
  }
  const next = nextStep(benchChecks(bench, ctx).filter((c) => c.group === 'bancada' || c.id === 'firmware'));
  const hint = next ? `próximo: ${next.label} — ${next.howTo}` : 'testes de bancada concluídos ✓';
  if (hint !== lastHint) {
    out(`>> ${hint}`);
    lastHint = hint;
  }
}
await reader.cancel().catch(() => undefined);
await port.close();
