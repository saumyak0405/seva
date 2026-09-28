import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookingEvents, bookings, workers } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { dateSchema, hhmmSchema, serviceSchema, uuidSchema } from '../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { createBooking, serializeBooking, transitionBooking } from '../services/bookings.js';
import { publicWorker } from '../services/workers.js';
import { notifier } from '../services/notifications.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const common = {
  workerId: uuidSchema,
  service: serviceSchema,
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  address: z.string().trim().min(5).max(300),
  notes: z.string().trim().max(500).optional(),
};

const CreateBookingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ONE_TIME'), date: dateSchema, ...common }),
  z.object({ type: z.literal('MONTHLY'), startDate: dateSchema, ...common }),
]);

bookingsRouter.post('/', requireRole('HOUSEHOLD'), async (req, res) => {
  const input = CreateBookingSchema.parse(req.body);
  const booking = await createBooking(currentUser(req).id, input);

  const [worker] = await db.select().from(workers).where(eq(workers.id, booking.workerId));
  await notifier.send(worker.phone, `New Seva ${booking.type === 'MONTHLY' ? 'monthly hire' : 'booking'} request. Our team will call you to confirm.`);

  res.status(201).json({ booking: serializeBooking(booking) });
});

bookingsRouter.get('/', async (req, res) => {
  const { status } = z
    .object({ status: z.enum(['active', 'past']).optional() })
    .parse(req.query);
  const statuses =
    status === 'active' ? (['REQUESTED', 'CONFIRMED'] as const) : status === 'past' ? (['COMPLETED', 'CANCELLED', 'REJECTED'] as const) : undefined;

  const rows = await db
    .select({ booking: bookings, worker: workers })
    .from(bookings)
    .innerJoin(workers, eq(workers.id, bookings.workerId))
    .where(and(eq(bookings.householdId, currentUser(req).id), statuses ? inArray(bookings.status, [...statuses]) : undefined))
    .orderBy(desc(bookings.createdAt))
    .limit(100);

  res.json({ bookings: rows.map((r) => ({ ...serializeBooking(r.booking), worker: publicWorker(r.worker) })) });
});

bookingsRouter.get('/:id', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const user = currentUser(req);
  const [row] = await db
    .select({ booking: bookings, worker: workers })
    .from(bookings)
    .innerJoin(workers, eq(workers.id, bookings.workerId))
    .where(eq(bookings.id, id));
  if (!row || (row.booking.householdId !== user.id && user.role !== 'ADMIN')) throw notFound('Booking');

  const events = await db
    .select({ fromStatus: bookingEvents.fromStatus, toStatus: bookingEvents.toStatus, note: bookingEvents.note, at: bookingEvents.createdAt })
    .from(bookingEvents)
    .where(eq(bookingEvents.bookingId, id))
    .orderBy(asc(bookingEvents.createdAt));

  res.json({ booking: { ...serializeBooking(row.booking), worker: publicWorker(row.worker), events } });
});

bookingsRouter.post('/:id/cancel', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const booking = await transitionBooking(id, currentUser(req), 'CANCELLED', reason);
  res.json({ booking: serializeBooking(booking) });
});
