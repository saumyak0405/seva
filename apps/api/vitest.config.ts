import { defineConfig } from 'vitest/config';

process.loadEnvFile(new URL('./.env.test', import.meta.url).pathname);

export default defineConfig({
  test: {
    env: { ...(process.env as Record<string, string>), NODE_ENV: 'test' },
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
