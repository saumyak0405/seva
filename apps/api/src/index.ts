import { createApp } from './app.js';
import { env } from './config.js';
import { pool } from './db/client.js';

const server = createApp().listen(env.PORT, () => {
  console.info(`Seva API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
