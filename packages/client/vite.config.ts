import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** En desarrollo el cliente vive aparte; en producción lo sirve el propio servidor. */
const server = process.env.TRIO_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: server, ws: true },
    },
  },
  build: { outDir: 'dist' },
});
