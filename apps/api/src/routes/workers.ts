import { Router } from 'express';
import { z } from 'zod';
import { and, arrayContains, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { workers } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { dateSchema, serviceSchema, uuidSchema } from '../lib/validation.js';
import { busyWindows } from '../services/bookings.js';
import { publicWorker } from '../services/workers.js';

export const workersRouter = Router();

const PAGE_SIZE = 20;

workersRouter.get('/', async (req, res) => {
  const q = z
    .object({
      service: serviceSchema.optional(),
      locality: z.string().trim().max(80).optional(),
      q: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);

  const escape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const where = and(
    eq(workers.verified, true),
    eq(workers.active, true),
    q.service ? arrayContains(workers.services, [q.service]) : undefined,
    q.locality ? ilike(workers.locality, `%${escape(q.locality)}%`) : undefined,
    q.q ? or(ilike(workers.name, `%${escape(q.q)}%`), ilike(workers.bio, `%${escape(q.q)}%`)) : undefined,
  );

  const rows = await db
    .select()
    .from(workers)
    .where(where)
    .orderBy(asc(workers.locality), asc(workers.name))
    .limit(PAGE_SIZE + 1)
    .offset((q.page - 1) * PAGE_SIZE);

  res.json({ workers: rows.slice(0, PAGE_SIZE).map(publicWorker), page: q.page, hasMore: rows.length > PAGE_SIZE });
});

workersRouter.get('/localities', async (_req, res) => {
  const rows = await db
    .selectDistinct({ locality: workers.locality })
    .from(workers)
    .where(and(eq(workers.verified, true), eq(workers.active, true)))
    .orderBy(sql`1`);
  res.json({ localities: rows.map((r) => r.locality) });
});

workersRouter.get('/:id', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const [worker] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.id, id), eq(workers.verified, true), eq(workers.active, true)));
  if (!worker) throw notFound('Worker');
  res.json({ worker: publicWorker(worker) });
});

workersRouter.get('/:id/availability', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { date } = z.object({ date: dateSchema }).parse(req.query);
  res.json({ date, busy: await busyWindows(id, date) });
});
