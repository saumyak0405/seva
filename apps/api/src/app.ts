import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config.js';
import { errorHandler } from './lib/errors.js';
import { authRouter, meRouter } from './routes/auth.js';
import { workersRouter } from './routes/workers.js';
import { bookingsRouter } from './routes/bookings.js';
import { adminRouter } from './routes/admin.js';
import { pool } from './db/client.js';

/** The built React app (apps/web/dist). Same relative path from src/ and dist/. */
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's load balancer
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ demoMode: env.DEMO_MODE });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // In production the API also serves the React app, so the whole product is one service and one URL.
  if (existsSync(WEB_DIST)) {
    app.use('/assets', express.static(`${WEB_DIST}assets`, { immutable: true, maxAge: '1y' }));
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    // Client-side routes (/workers/123, /admin …) all load index.html.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(`${WEB_DIST}index.html`);
    });
  }

  app.use(errorHandler);
  return app;
}
