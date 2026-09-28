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

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway/NGINX
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
