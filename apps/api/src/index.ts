import { createApp } from './app.js';
import { env } from './config.js';
import { pool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedIfEmpty } from './db/demo-data.js';

await runMigrations();
if (env.SEED_DEMO_DATA && (await seedIfEmpty())) {
  console.info('Seeded demo workers into an empty database');
}

const server = createApp().listen(env.PORT, () => {
  console.info(`Seva listening on http://localhost:${env.PORT}${env.DEMO_MODE ? ' (demo mode)' : ''}`);
});

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
