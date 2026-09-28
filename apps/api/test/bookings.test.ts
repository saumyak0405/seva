import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { bookingEvents, bookings } from '../src/db/schema.js';
import { ADMIN_PHONE, api, auth, createWorker, inDays, login, resetDb } from './helpers.js';

beforeEach(resetDb);

const ADDRESS = '45 Sanjay Place, Agra';

function oneTime(workerId: string, date: string, startTime = '09:00', endTime = '11:00') {
  return { type: 'ONE_TIME', workerId, service: 'CLEANING', date, startTime, endTime, address: ADDRESS };
}
function monthly(workerId: string, startDate: string, startTime = '08:00', endTime = '10:00') {
  return { type: 'MONTHLY', workerId, service: 'CLEANING', startDate, startTime, endTime, address: ADDRESS };
}

describe('creating bookings', () => {
  it('books a one-time slot and prices it from the hourly rate', async () => {
    const worker = await createWorker({ hourlyRate: 120 });
    const { token } = await login();
    const date = inDays(3);

    const r = await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, date, '09:00', '11:30')).expect(201);
    expect(r.body.booking).toMatchObject({
      status: 'REQUESTED',
      priceRupees: 300, // 2.5h × ₹120
      feeRupees: 49,
      schedule: { date, startTime: '09:00', endTime: '11:30' },
    });

    const events = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, r.body.booking.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: null, toStatus: 'REQUESTED' });
  });

  it('stores one-time slots in UTC but returns them in IST', async () => {
    const worker = await createWorker();
    const { token } = await login();
    const date = inDays(3);
    const r = await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, date, '09:00', '11:00')).expect(201);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, r.body.booking.id));
    expect(row.startAt!.toISOString()).toBe(`${date}T03:30:00.000Z`); // 09:00 IST
  });

  it('prices a monthly hire from the monthly rate', async () => {
    const worker = await createWorker({ monthlyRate: 5200 });
    const { token } = await login();
    const r = await api().post('/api/bookings').set(auth(token)).send(monthly(worker.id, inDays(2))).expect(201);
    expect(r.body.booking).toMatchObject({ type: 'MONTHLY', priceRupees: 5200, schedule: { startTime: '08:00', endTime: '10:00' } });
  });

  it('rejects overlapping one-time bookings but allows back-to-back ones', async () => {
    const worker = await createWorker();
    const a = await login();
    const b = await login();
    const date = inDays(4);

    await api().post('/api/bookings').set(auth(a.token)).send(oneTime(worker.id, date, '09:00', '11:00')).expect(201);
    const clash = await api().post('/api/bookings').set(auth(b.token)).send(oneTime(worker.id, date, '10:00', '12:00')).expect(409);
    expect(clash.body.error.code).toBe('SLOT_TAKEN');
    await api().post('/api/bookings').set(auth(b.token)).send(oneTime(worker.id, date, '11:00', '12:00')).expect(201);
  });

  it('a monthly hire blocks one-time bookings in the same window on later days', async () => {
    const worker = await createWorker();
    const a = await login();
    const b = await login();

    await api().post('/api/bookings').set(auth(a.token)).send(monthly(worker.id, inDays(2), '08:00', '10:00')).expect(201);
    await api().post('/api/bookings').set(auth(b.token)).send(oneTime(worker.id, inDays(10), '09:00', '10:00')).expect(409);
    await api().post('/api/bookings').set(auth(b.token)).send(oneTime(worker.id, inDays(10), '10:00', '11:00')).expect(201);
  });

  it('a one-time booking blocks a monthly hire that would overlap it', async () => {
    const worker = await createWorker();
    const a = await login();
    const b = await login();

    await api().post('/api/bookings').set(auth(a.token)).send(oneTime(worker.id, inDays(10), '09:00', '10:00')).expect(201);
    await api().post('/api/bookings').set(auth(b.token)).send(monthly(worker.id, inDays(3), '08:00', '10:00')).expect(409);
    // Starting after that day is fine
    await api().post('/api/bookings').set(auth(b.token)).send(monthly(worker.id, inDays(11), '08:00', '10:00')).expect(201);
  });

  it('frees the slot when a booking is cancelled', async () => {
    const worker = await createWorker();
    const a = await login();
    const b = await login();
    const date = inDays(5);

    const first = await api().post('/api/bookings').set(auth(a.token)).send(oneTime(worker.id, date)).expect(201);
    await api().post(`/api/bookings/${first.body.booking.id}/cancel`).set(auth(a.token)).send({}).expect(200);
    await api().post('/api/bookings').set(auth(b.token)).send(oneTime(worker.id, date)).expect(201);
  });

  it('under 10 simultaneous requests for the same slot, exactly one wins', async () => {
    const worker = await createWorker();
    const households = await Promise.all(Array.from({ length: 10 }, () => login()));
    const date = inDays(6);

    const results = await Promise.all(
      households.map((h) => api().post('/api/bookings').set(auth(h.token)).send(oneTime(worker.id, date, '14:00', '16:00'))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);

    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.workerId, worker.id));
    expect(n).toBe(1);
  });

  it('the database exclusion constraint rejects overlaps even if app checks are bypassed', async () => {
    const worker = await createWorker();
    const { user } = await login();
    const base = {
      householdId: user.id,
      workerId: worker.id,
      type: 'ONE_TIME' as const,
      service: 'CLEANING' as const,
      address: ADDRESS,
      priceRupees: 240,
      feeRupees: 49,
    };
    await db.insert(bookings).values({ ...base, startAt: new Date('2030-01-01T03:30:00Z'), endAt: new Date('2030-01-01T05:30:00Z') });
    await expect(
      db.insert(bookings).values({ ...base, startAt: new Date('2030-01-01T04:30:00Z'), endAt: new Date('2030-01-01T06:30:00Z') }),
    ).rejects.toMatchObject({ cause: { code: '23P01' } });
  });

  it.each([
    ['end before start', { startTime: '11:00', endTime: '09:00' }],
    ['under an hour', { startTime: '09:00', endTime: '09:45' }],
    ['over 10 hours', { startTime: '06:00', endTime: '17:00' }],
    ['not on a 15-minute step', { startTime: '09:10', endTime: '11:00' }],
  ])('rejects invalid windows: %s', async (_label, times) => {
    const worker = await createWorker();
    const { token } = await login();
    await api().post('/api/bookings').set(auth(token)).send({ ...oneTime(worker.id, inDays(3)), ...times }).expect(400);
  });

  it('rejects past dates and dates beyond 60 days', async () => {
    const worker = await createWorker();
    const { token } = await login();
    await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, inDays(-1))).expect(400);
    await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, inDays(61))).expect(400);
  });

  it('rejects unverified workers, unoffered services and monthly hire without a monthly rate', async () => {
    const unverified = await createWorker({ verified: false });
    const cookOnly = await createWorker({ services: ['COOKING'] });
    const noMonthly = await createWorker({ monthlyRate: null });
    const { token } = await login();

    await api().post('/api/bookings').set(auth(token)).send(oneTime(unverified.id, inDays(3))).expect(404);
    await api().post('/api/bookings').set(auth(token)).send(oneTime(cookOnly.id, inDays(3))).expect(400);
    await api().post('/api/bookings').set(auth(token)).send(monthly(noMonthly.id, inDays(3))).expect(400);
  });

  it('only households can create bookings', async () => {
    const worker = await createWorker();
    const admin = await login(ADMIN_PHONE);
    await api().post('/api/bookings').set(auth(admin.token)).send(oneTime(worker.id, inDays(3))).expect(403);
  });
});

describe('viewing and cancelling', () => {
  it("households can't see or cancel each other's bookings", async () => {
    const worker = await createWorker();
    const owner = await login();
    const stranger = await login();
    const r = await api().post('/api/bookings').set(auth(owner.token)).send(oneTime(worker.id, inDays(3))).expect(201);
    const id = r.body.booking.id;

    await api().get(`/api/bookings/${id}`).set(auth(stranger.token)).expect(404);
    await api().post(`/api/bookings/${id}/cancel`).set(auth(stranger.token)).send({}).expect(404);
    const mine = await api().get('/api/bookings').set(auth(stranger.token)).expect(200);
    expect(mine.body.bookings).toHaveLength(0);
  });

  it('shows the booking history with its audit trail', async () => {
    const worker = await createWorker();
    const { token } = await login();
    const r = await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, inDays(3))).expect(201);
    await api().post(`/api/bookings/${r.body.booking.id}/cancel`).set(auth(token)).send({ reason: 'Plans changed' }).expect(200);

    const detail = await api().get(`/api/bookings/${r.body.booking.id}`).set(auth(token)).expect(200);
    expect(detail.body.booking.status).toBe('CANCELLED');
    expect(detail.body.booking.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(['REQUESTED', 'CANCELLED']);
    expect(detail.body.booking.worker).not.toHaveProperty('phone');
  });

  it('cannot cancel a booking twice', async () => {
    const worker = await createWorker();
    const { token } = await login();
    const r = await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, inDays(3))).expect(201);
    await api().post(`/api/bookings/${r.body.booking.id}/cancel`).set(auth(token)).send({}).expect(200);
    const again = await api().post(`/api/bookings/${r.body.booking.id}/cancel`).set(auth(token)).send({}).expect(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('reports busy windows for a worker on a date', async () => {
    const worker = await createWorker();
    const { token } = await login();
    await api().post('/api/bookings').set(auth(token)).send(monthly(worker.id, inDays(2), '07:00', '08:30')).expect(201);
    await api().post('/api/bookings').set(auth(token)).send(oneTime(worker.id, inDays(4), '15:00', '17:00')).expect(201);

    const r = await api().get(`/api/workers/${worker.id}/availability?date=${inDays(4)}`).expect(200);
    expect(r.body.busy).toEqual([
      { start: '07:00', end: '08:30', recurring: true },
      { start: '15:00', end: '17:00', recurring: false },
    ]);
  });
});
