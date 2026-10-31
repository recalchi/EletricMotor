import { isNative } from '../platform/native';

/**
 * Canal ao vivo (versão de PC): envia eventos do app para o servidor local (tools/liveLogPlugin.ts), que grava em
 * hw-logs/. Só funciona com o app aberto em localhost — no APK e em qualquer outro endereço não envia nada.
 * Não manda senhas, tokens nem dados pessoais: apenas mensagens do gateway, estados e erros.
 */
const ENDPOINT = '/__live/log';
const FLUSH_MS = 500;
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;

export function liveEnabled(host = (globalThis as { location?: { hostname: string } }).location?.hostname ?? '') {
  return !disabled && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !isNative();
}

export function live(kind: string, data: Record<string, unknown> | string) {
  if (!liveEnabled()) return;
  const t = new Date();
  const hh = t.toLocaleTimeString('pt-BR') + '.' + String(t.getMilliseconds()).padStart(3, '0');
  queue.push(`${hh} ${kind.padEnd(6)} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  if (queue.length > 2000) queue = queue.slice(-2000);
  timer ??= setTimeout(flush, FLUSH_MS);
}

async function flush() {
  timer = null;
  if (!queue.length) return;
  const body = queue.join('\n');
  queue = [];
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true });
    if (r.status === 404 || r.status === 403) disabled = true; // servidor sem o canal (ex.: hospedagem): para de tentar
  } catch {
    /* servidor local parado: descarta */
  }
}
