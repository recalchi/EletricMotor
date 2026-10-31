/**
 * Teste de bancada sem gravar nada: reinicia a placa (EN pelo RTS), escuta e confere o que o app espera —
 * anúncio "# fw" da versão do catálogo, mensagens EMGP válidas, sequência sem perdas e boot sem pânico.
 *   npm run hw:smoke -- --port COM7 [--version 1.1.0] [--seconds 20]
 */
import { latestRelease, parseFirmwareAnnounce } from '../../src/integrations/firmware';
import { bootCheck } from '../../src/integrations/flasher';
import { parseEmgpLine, seqGap, type EmgpMessage } from '../../src/integrations/protocol';
import { NodePort, arg } from './nodePort';

const path = arg('port');
if (!path) throw new Error('Informe --port (ex.: COM7)');
const version = arg('version') ?? latestRelease('esp32-gateway')!.version;
const seconds = Number(arg('seconds', '20'));

const port = new NodePort(path);
await port.open({ baudRate: 115200 });
const reader = port.readable!.getReader();
await port.setSignals({ dataTerminalReady: false, requestToSend: true });
await new Promise((r) => setTimeout(r, 120));
await port.setSignals({ dataTerminalReady: false, requestToSend: false });
let text = '';
const dec = new TextDecoder();
const end = Date.now() + seconds * 1000;
while (Date.now() < end) {
  const timer = new Promise<'t'>((res) => setTimeout(() => res('t'), Math.max(10, end - Date.now())));
  const r = await Promise.race([reader.read(), timer]);
  if (r === 't' || r.done) break;
  text += dec.decode(r.value, { stream: true });
}
await reader.cancel().catch(() => undefined);
await port.close();

const lines = text.split(/\r?\n/).filter((l) => l.trim());
const fw = lines.map(parseFirmwareAnnounce).find(Boolean);
const parsed = lines.filter((l) => l.trim().startsWith('{')).map((l) => parseEmgpLine(l));
const ok: EmgpMessage[] = parsed.flatMap((m) => (m.ok ? [m.msg] : []));
let lost = 0;
ok.forEach((m, i) => {
  if (i) lost += seqGap(ok[i - 1].seq, m.seq).lost;
});
const boot = bootCheck(text, 'esp32-gateway', version);

const checks: [string, boolean, string][] = [
  ['Boot sem pânico e versão anunciada', boot.ok, boot.ok ? `${fw?.name} ${fw?.version}` : (boot.problem ?? '')],
  ['Mensagens EMGP recebidas', ok.length >= Math.floor(seconds / 3), `${ok.length} válidas, ${parsed.length - ok.length} inválidas`],
  ['Sequência sem perdas', lost === 0, `${lost} perdida(s)`],
];
for (const [name, pass, detail] of checks) console.log(`${pass ? 'OK   ' : 'FALHA'} ${name} — ${detail}`);
const lastMsg = ok[ok.length - 1];
if (lastMsg) console.log(`última mensagem: canais ${JSON.stringify(lastMsg.ch)} status ${JSON.stringify(lastMsg.st)}`);
process.exit(checks.every((c) => c[1]) ? 0 : 1);
