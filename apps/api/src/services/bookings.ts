import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { db, type Tx } from '../db/client.js';
import { bookingEvents, bookings, workers, type Booking, type BookingStatus, type ServiceType } from '../db/schema.js';
import { env } from '../config.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { IST_OFFSET_MIN, addDays, formatHHMM, istDate, istMinuteOfDay, istToday, overlaps, parseHHMM } from '../lib/time.js';
import type { AuthUser } from '../middleware/auth.js';

export const ACTIVE_STATUSES: BookingStatus[] = ['REQUESTED', 'CONFIRMED'];

export type CreateBookingInput =
  | {
      type: 'ONE_TIME';
      workerId: string;
      service: ServiceType;
      date: string; // YYYY-MM-DD (IST)
      startTime: string; // HH:MM (IST)
      endTime: string;
      address: string;
      notes?: string;
    }
  | {
      type: 'MONTHLY';
      workerId: string;
      service: ServiceType;
      startDate: string;
      startTime: string;
      endTime: string;
      address: string;
      notes?: string;
    };

/** A booking's footprint on the worker's calendar, in IST. */
type Slot =
  | { kind: 'once'; date: string; from: number; to: number }
  | { kind: 'daily'; fromDate: string; from: number; to: number };

const MAX_ADVANCE_DAYS = 60;

function istInstant(date: string, minute: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minute - IST_OFFSET_MIN) * 60_000);
}

export function slotOf(b: Pick<Booking, 'type' | 'startAt' | 'endAt' | 'startDate' | 'dailyStartMinute' | 'dailyEndMinute'>): Slot {
  if (b.type === 'ONE_TIME') {
    const date = istDate(b.startAt!);
    const from = istMinuteOfDay(b.startAt!);
    const to = from + Math.round((b.endAt!.getTime() - b.startAt!.getTime()) / 60_000);
    return { kind: 'once', date, from, to };
  }
  return { kind: 'daily', fromDate: b.startDate!, from: b.dailyStartMinute!, to: b.dailyEndMinute! };
}

/** Do two calendar footprints ever overlap? Monthly hires are open-ended until cancelled. */
export function slotsClash(a: Slot, b: Slot): boolean {
  if (!overlaps(a.from, a.to, b.from, b.to)) return false;
  if (a.kind === 'once' && b.kind === 'once') return a.date === b.date;
  if (a.kind === 'daily' && b.kind === 'daily') return true;
  const once = (a.kind === 'once' ? a : b) as Extract<Slot, { kind: 'once' }>;
  const daily = (a.kind === 'daily' ? a : b) as Extract<Slot, { kind: 'daily' }>;
  return once.date >= daily.fromDate;
}

function validateWindow(startTime: string, endTime: string, maxHours: number) {
  const from = parseHHMM(startTime);
  const to = parseHHMM(endTime);
  if (from % 15 !== 0 || to % 15 !== 0) throw badRequest('Times must be in 15-minute steps');
  if (to <= from) throw badRequest('End time must be after start time');
  if (to - from < 60) throw badRequest('Minimum booking is 1 hour');
  if (to - from > maxHours * 60) throw badRequest(`Maximum is ${maxHours} hours per day`);
  return { from, to };
}

export async function createBooking(householdId: string, input: CreateBookingInput, now = new Date()) {
  const today = istToday(now);
  const lastDay = addDays(today, MAX_ADVANCE_DAYS);
  const { from, to } = validateWindow(input.startTime, input.endTime, input.type === 'ONE_TIME' ? 10 : 12);

  let candidate: Slot;
  if (input.type === 'ONE_TIME') {
    if (input.date > lastDay) throw badRequest(`Bookings can be made up to ${MAX_ADVANCE_DAYS} days ahead`);
    if (istInstant(input.date, from).getTime() <= now.getTime() + 60 * 60_000) {
      throw badRequest('Start time must be at least 1 hour from now');
    }
    candidate = { kind: 'once', date: input.date, from, to };
  } else {
    if (input.startDate <= today) throw badRequest('Monthly hires start from tomorrow at the earliest');
    if (input.startDate > lastDay) throw badRequest(`Start date must be within ${MAX_ADVANCE_DAYS} days`);
    candidate = { kind: 'daily', fromDate: input.startDate, from, to };
  }

  const created = await db.transaction(async (tx) => {
    // Lock the worker row: concurrent bookings for the same worker queue up here,
    // so the clash check below always sees every committed booking.
    const [worker] = await tx.select().from(workers).where(eq(workers.id, input.workerId)).for('update');
    if (!worker || !worker.verified || !worker.active) throw notFound('Worker');
    if (!worker.services.includes(input.service)) throw badRequest('This worker does not offer that service');
    if (input.type === 'MONTHLY' && worker.monthlyRate == null) {
      throw badRequest('This worker is not available for monthly hire');
    }

    const earliest = candidate.kind === 'once' ? istInstant(candidate.date, 0) : istInstant(candidate.fromDate, 0);
    const existing = await tx
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.workerId, worker.id),
          inArray(bookings.status, ACTIVE_STATUSES),
          or(eq(bookings.type, 'MONTHLY'), gt(bookings.endAt, earliest)),
        ),
      );
    if (existing.some((b) => slotsClash(slotOf(b), candidate))) {
      throw conflict('This worker is already booked for that time', 'SLOT_TAKEN');
    }

    const minutes = to - from;
    const values =
      input.type === 'ONE_TIME'
        ? {
            startAt: istInstant(input.date, from),
            endAt: istInstant(input.date, to),
            priceRupees: Math.ceil((worker.hourlyRate * minutes) / 60),
          }
        : {
            startDate: input.startDate,
            dailyStartMinute: from,
            dailyEndMinute: to,
            priceRupees: worker.monthlyRate!,
          };

    const [booking] = await tx
      .insert(bookings)
      .values({
        householdId,
        workerId: worker.id,
        type: input.type,
        service: input.service,
        address: input.address,
        notes: input.notes,
        feeRupees: env.BOOKING_FEE_RUPEES,
        ...values,
      })
      .returning();

    await tx.insert(bookingEvents).values({ bookingId: booking.id, toStatus: 'REQUESTED', actorId: householdId });
    return booking;
  });

  return created;
}

/** Who may move a booking from one status to another. */
const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, 'ADMIN' | 'OWNER_OR_ADMIN'>>> = {
  REQUESTED: { CONFIRMED: 'ADMIN', REJECTED: 'ADMIN', CANCELLED: 'OWNER_OR_ADMIN' },
  CONFIRMED: { COMPLETED: 'ADMIN', CANCELLED: 'OWNER_OR_ADMIN' },
  COMPLETED: {},
  CANCELLED: {},
  REJECTED: {},
};

export async function transitionBooking(
  bookingId: string,
  actor: AuthUser,
  to: BookingStatus,
  note?: string,
  now = new Date(),
): Promise<Booking> {
  return db.transaction(async (tx: Tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for('update');
    if (!booking) throw notFound('Booking');

    const isOwner = booking.householdId === actor.id;
    const isAdmin = actor.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw notFound('Booking'); // don't reveal other households' bookings

    const rule = TRANSITIONS[booking.status][to];
    if (!rule) {
      throw new HttpError(409, 'INVALID_TRANSITION', `Cannot change a ${booking.status.toLowerCase()} booking to ${to.toLowerCase()}`);
    }
    if (rule === 'ADMIN' && !isAdmin) throw forbidden('Only Seva staff can do this');

    if (booking.type === 'ONE_TIME') {
      if (to === 'CANCELLED' && !isAdmin && booking.startAt! <= now) {
        throw badRequest('This booking has already started and can no longer be cancelled');
      }
      if (to === 'COMPLETED' && booking.startAt! > now) {
        throw badRequest('A booking cannot be completed before it starts');
      }
    }

    const [updated] = await tx.update(bookings).set({ status: to }).where(eq(bookings.id, booking.id)).returning();
    await tx.insert(bookingEvents).values({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: to,
      actorId: actor.id,
      note,
    });
    return updated;
  });
}

/** Busy windows (IST) for one worker on one date — used by the booking form. */
export async function busyWindows(workerId: string, date: string) {
  const dayStart = istInstant(date, 0);
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.workerId, workerId),
        inArray(bookings.status, ACTIVE_STATUSES),
        or(eq(bookings.type, 'MONTHLY'), gt(bookings.endAt, dayStart)),
      ),
    );
  const probe = (s: Slot) => (s.kind === 'once' ? s.date === date : s.fromDate <= date);
  return rows
    .map(slotOf)
    .filter(probe)
    .map((s) => ({ start: formatHHMM(s.from), end: formatHHMM(s.to), recurring: s.kind === 'daily' }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** API shape: times expressed in IST so clients don't do timezone math. */
export function serializeBooking(b: Booking) {
  const slot = slotOf(b);
  return {
    id: b.id,
    type: b.type,
    service: b.service,
    status: b.status,
    workerId: b.workerId,
    householdId: b.householdId,
    schedule:
      slot.kind === 'once'
        ? { date: slot.date, startTime: formatHHMM(slot.from), endTime: formatHHMM(slot.to) }
        : { startDate: slot.fromDate, startTime: formatHHMM(slot.from), endTime: formatHHMM(slot.to) },
    address: b.address,
    notes: b.notes,
    priceRupees: b.priceRupees,
    feeRupees: b.feeRupees,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}
