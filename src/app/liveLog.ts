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
let busy = false;

/** Marca uma operação que não pode ser interrompida por recarregar a página (ex.: gravação de firmware). */
export function setLiveBusy(b: boolean) {
  busy = b;
}

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

declare const __BUILD_ID__: string;

/**
 * Versão de PC: quando sai um build novo (o atalho recompila), recarrega sozinho — fora de gravação de firmware.
 * Se o USB estava conectado, volta com ?auto=usb para reconectar à porta já autorizada.
 */
export function watchForNewBuild(usbConnected: () => boolean, everyMs = 15_000) {
  if (!liveEnabled() || typeof __BUILD_ID__ === 'undefined') return;
  setInterval(async () => {
    if (busy) return;
    try {
      const r = await fetch('/__build.txt', { cache: 'no-store' });
      if (!r.ok) return;
      const id = (await r.text()).trim();
      if (!id || id === __BUILD_ID__) return;
      live('acao', `versão nova (${id}) — recarregando`);
      await flush();
      const url = new URL(window.location.href);
      if (usbConnected()) url.searchParams.set('auto', 'usb');
      window.location.replace(url.toString());
    } catch {
      /* servidor parado */
    }
  }, everyMs);
}
