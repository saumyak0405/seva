import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookings, users, workers } from '../db/schema.js';
import { encryptId } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/errors.js';
import { bookingStatusSchema, idTypeSchema, phoneSchema, serviceSchema, uuidSchema } from '../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { serializeBooking, transitionBooking } from '../services/bookings.js';
import { adminWorker } from '../services/workers.js';
import { notifier } from '../services/notifications.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

// ---------- Workers ----------

const ID_FORMATS: Record<z.infer<typeof idTypeSchema>, RegExp> = {
  AADHAAR: /^\d{12}$/,
  VOTER_ID: /^[A-Z]{3}\d{7}$/,
  PAN: /^[A-Z]{5}\d{4}[A-Z]$/,
  DRIVING_LICENCE: /^[A-Z]{2}\d{2}[A-Z0-9]{11,13}$/,
};

const WorkerFields = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  services: z.array(serviceSchema).min(1).max(6),
  locality: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60).default('Agra'),
  languages: z.array(z.string().trim().min(2).max(30)).max(6).default(['Hindi']),
  experienceYears: z.number().int().min(0).max(50).default(0),
  hourlyRate: z.number().int().min(50).max(2000),
  monthlyRate: z.number().int().min(1000).max(100000).nullable().optional(),
  bio: z.string().trim().max(500).optional(),
  id: z
    .object({ type: idTypeSchema, number: z.string().trim().toUpperCase().transform((v) => v.replace(/[\s-]/g, '')) })
    .optional(),
});

function idColumns(id: z.infer<typeof WorkerFields>['id']) {
  if (!id) return {};
  if (!ID_FORMATS[id.type].test(id.number)) throw badRequest(`Invalid ${id.type.replace('_', ' ').toLowerCase()} number`);
  return { idType: id.type, idLast4: id.number.slice(-4), idNumberEnc: encryptId(id.number) };
}

adminRouter.get('/workers', async (req, res) => {
  const { verified } = z.object({ verified: z.enum(['true', 'false']).optional() }).parse(req.query);
  const rows = await db
    .select()
    .from(workers)
    .where(verified ? eq(workers.verified, verified === 'true') : undefined)
    .orderBy(desc(workers.createdAt));
  res.json({ workers: rows.map(adminWorker) });
});

adminRouter.post('/workers', async (req, res) => {
  const { id, ...fields } = WorkerFields.parse(req.body);
  const [worker] = await db.insert(workers).values({ ...fields, ...idColumns(id) }).returning();
  res.status(201).json({ worker: adminWorker(worker) });
});

adminRouter.patch('/workers/:id', async (req, res) => {
  const workerId = uuidSchema.parse(req.params.id);
  const { id, ...fields } = WorkerFields.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const [worker] = await db.update(workers).set({ ...fields, ...idColumns(id) }).where(eq(workers.id, workerId)).returning();
  if (!worker) throw notFound('Worker');
  res.json({ worker: adminWorker(worker) });
});

adminRouter.post('/workers/:id/verify', async (req, res) => {
  const workerId = uuidSchema.parse(req.params.id);
  const [existing] = await db.select().from(workers).where(eq(workers.id, workerId));
  if (!existing) throw notFound('Worker');
  if (!existing.idNumberEnc) throw badRequest('Add a government ID before verifying this worker', 'ID_REQUIRED');
  const [worker] = await db
    .update(workers)
    .set({ verified: true, verifiedAt: new Date() })
    .where(eq(workers.id, workerId))
    .returning();
  res.json({ worker: adminWorker(worker) });
});

// ---------- Bookings ----------

adminRouter.get('/bookings', async (req, res) => {
  const { status } = z.object({ status: bookingStatusSchema.optional() }).parse(req.query);
  const rows = await db
    .select({ booking: bookings, worker: workers, household: users })
    .from(bookings)
    .innerJoin(workers, eq(workers.id, bookings.workerId))
    .innerJoin(users, eq(users.id, bookings.householdId))
    .where(status ? eq(bookings.status, status) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(200);

  res.json({
    bookings: rows.map((r) => ({
      ...serializeBooking(r.booking),
      worker: { id: r.worker.id, name: r.worker.name, phone: r.worker.phone },
      household: { id: r.household.id, name: r.household.name, phone: r.household.phone },
    })),
  });
});

adminRouter.post('/bookings/:id/transition', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { to, note } = z
    .object({ to: z.enum(['CONFIRMED', 'REJECTED', 'COMPLETED', 'CANCELLED']), note: z.string().trim().max(300).optional() })
    .parse(req.body);
  const booking = await transitionBooking(id, currentUser(req), to, note);

  if (to === 'CONFIRMED' || to === 'REJECTED' || to === 'CANCELLED') {
    const [household] = await db.select().from(users).where(eq(users.id, booking.householdId));
    await notifier.send(household.phone, `Your Seva booking was ${to.toLowerCase()}.`);
  }
  res.json({ booking: serializeBooking(booking) });
});

// ---------- Dashboard ----------

adminRouter.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [[w], [pending], byStatus, [recent]] = await Promise.all([
    db
      .select({ total: count(), verified: sql<number>`count(*) filter (where ${workers.verified})`.mapWith(Number) })
      .from(workers)
      .where(eq(workers.active, true)),
    db.select({ n: count() }).from(bookings).where(eq(bookings.status, 'REQUESTED')),
    db.select({ status: bookings.status, n: count() }).from(bookings).groupBy(bookings.status),
    db
      .select({ n: count(), fees: sql<number>`coalesce(sum(${bookings.feeRupees}), 0)`.mapWith(Number) })
      .from(bookings)
      .where(and(gte(bookings.createdAt, since), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))),
  ]);

  res.json({
    workers: { active: w.total, verified: w.verified },
    bookings: {
      awaitingConfirmation: pending.n,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      last30Days: { confirmedOrCompleted: recent.n, feesRupees: recent.fees },
    },
  });
});
