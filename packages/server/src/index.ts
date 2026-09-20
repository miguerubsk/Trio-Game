import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
// Tanto src/ (desarrollo) como dist/ (compilado) están a la misma altura del cliente.
const clientDir = process.env.CLIENT_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
const hasClient = existsSync(clientDir);

const app = createApp({ clientDir: hasClient ? clientDir : null });

app.http.listen(port, host, () => {
  console.log(`Trio escuchando en http://${host}:${port}`);
  if (!hasClient) console.log(`Sin cliente compilado en ${clientDir}: solo sockets y /healthz.`);
});

const shutdown = () => {
  void app.close().then(() => process.exit(0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
