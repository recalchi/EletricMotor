import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

/**
 * Canal ao vivo da versão de PC: o app (servido em localhost) envia eventos para POST /__live/log e eles são
 * gravados em hw-logs/app-live-AAAAMMDD.log — assim dá para acompanhar uma bateria de testes ou uma gravação de
 * firmware em tempo real, sem disputar a porta USB com o app. GET /__live/log?tail=N devolve as últimas linhas.
 * Só aceita conexões do próprio computador; nada sai da máquina.
 */
const MAX_BODY = 256 * 1024;
const dir = resolve(process.cwd(), 'hw-logs');
const file = () => resolve(dir, `app-live-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`);

export function isLoopback(addr: string | undefined) {
  return !!addr && /^(127\.|::1$|::ffff:127\.)/.test(addr);
}

function handler(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (!req.url?.startsWith('/__live/log')) return next();
    if (!isLoopback(req.socket.remoteAddress)) {
      res.statusCode = 403;
      return res.end();
    }
    if (req.method === 'GET') {
      const tail = Number(new URL(req.url, 'http://x').searchParams.get('tail') ?? 200);
      const f = file();
      const lines = existsSync(f) ? readFileSync(f, 'utf8').trimEnd().split('\n') : [];
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      return res.end(lines.slice(-tail).join('\n') + '\n');
    }
    if (req.method !== 'POST') return next();
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      mkdirSync(dir, { recursive: true });
      const lines = body.split('\n').filter((l) => l.trim());
      if (lines.length) appendFileSync(file(), lines.join('\n') + '\n');
      res.statusCode = 204;
      res.end();
    });
  };
}

export function liveLogPlugin(): Plugin {
  return {
    name: 'eletricmotor-live-log',
    configureServer: (s) => void s.middlewares.use(handler()),
    configurePreviewServer: (s) => void s.middlewares.use(handler()),
  };
}
