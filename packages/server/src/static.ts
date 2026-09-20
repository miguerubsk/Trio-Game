import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

/**
 * Sirve el cliente compilado desde el mismo origen que los sockets (sin CORS).
 * Las rutas sin extensión caen en index.html para que la app resuelva la suya.
 */
export function staticHandler(root: string | null) {
  const base = root ? resolve(root) : null;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/healthz') return send(res, 200, 'ok');
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
      if (!base) return send(res, 404, 'El cliente no está compilado');

      let path: string;
      try {
        path = decodeURIComponent(url.pathname);
      } catch {
        return send(res, 400, 'Ruta no válida');
      }
      const target = resolve(base, `.${path}`);
      if (path.includes('\0') || (target !== base && !target.startsWith(base + sep))) {
        return send(res, 404, 'No encontrado');
      }

      const index = join(base, 'index.html');
      const file = (await fileAt(target)) ?? (extname(path) ? null : await fileAt(index));
      if (!file) return send(res, 404, 'No encontrado');

      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': TYPES[extname(file.path)] ?? 'application/octet-stream',
        'content-length': file.size,
        // Vite pone un hash en el nombre de todo lo que hay en /assets.
        'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(file.path)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (err) {
      console.error('[http]', err);
      if (!res.headersSent) send(res, 500, 'Error interno');
      else res.destroy();
    }
  };
}

async function fileAt(path: string): Promise<{ path: string; size: number } | null> {
  try {
    const info = await stat(path);
    if (info.isFile()) return { path, size: info.size };
    if (info.isDirectory()) {
      const index = join(path, 'index.html');
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return { path: index, size: indexInfo.size };
    }
  } catch {
    // No existe: el llamante decide si cae en index.html o responde 404.
  }
  return null;
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}
