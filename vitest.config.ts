import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests de componentes piden happy-dom con una cabecera en su archivo.
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
