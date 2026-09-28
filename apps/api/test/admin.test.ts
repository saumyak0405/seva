import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { workers } from '../src/db/schema.js';
import { decryptId } from '../src/lib/crypto.js';
import { ADMIN_PHONE, api, auth, createWorker, inDays, login, resetDb } from './helpers.js';

beforeEach(resetDb);

const newWorker = {
  name: 'Lakshmi Devi',
  phone: '7011122233',
  services: ['CLEANING', 'LAUNDRY'],
  locality: 'Tajganj',
  languages: ['Hindi'],
  experienceYears: 4,
  hourlyRate: 110,
  monthlyRate: 4000,
  id: { type: 'AADHAAR', number: '4321 8765 1234' },
};

describe('admin: workers', () => {
  it('blocks non-admins', async () => {
    const { token } = await login();
    await api().get('/api/admin/workers').set(auth(token)).expect(403);
    await api().post('/api/admin/workers').set(auth(token)).send(newWorker).expect(403);
  });

  it('onboards a worker with an encrypted ID, then verifies them', async () => {
    const admin = await login(ADMIN_PHONE);
    const created = await api().post('/api/admin/workers').set(auth(admin.token)).send(newWorker).expect(201);
    expect(created.body.worker).toMatchObject({ verified: false, idType: 'AADHAAR', idLast4: '1234', hasIdOnFile: true });
    expect(JSON.stringify(created.body)).not.toContain('432187651234');

    const [row] = await db.select().from(workers).where(eq(workers.id, created.body.worker.id));
    expect(row.idNumberEnc).not.toContain('432187651234');
    expect(decryptId(row.idNumberEnc!)).toBe('432187651234');

    // Not listed publicly until verified
    let list = await api().get('/api/workers').expect(200);
    expect(list.body.workers).toHaveLength(0);

    await api().post(`/api/admin/workers/${row.id}/verify`).set(auth(admin.token)).expect(200);
    list = await api().get('/api/workers').expect(200);
    expect(list.body.workers).toHaveLength(1);
    expect(list.body.workers[0]).not.toHaveProperty('phone');
    expect(list.body.workers[0]).not.toHaveProperty('idLast4');
  });

  it('rejects malformed ID numbers', async () => {
    const admin = await login(ADMIN_PHONE);
    const r = await api()
      .post('/api/admin/workers')
      .set(auth(admin.token))
      .send({ ...newWorker, id: { type: 'AADHAAR', number: '1234' } })
      .expect(400);
    expect(r.body.error.message).toMatch(/aadhaar/i);
  });

  it('refuses to verify a worker without an ID on file', async () => {
    const admin = await login(ADMIN_PHONE);
    const w = await createWorker({ verified: false, idType: null, idLast4: null, idNumberEnc: null });
    const r = await api().post(`/api/admin/workers/${w.id}/verify`).set(auth(admin.token)).expect(400);
    expect(r.body.error.code).toBe('ID_REQUIRED');
  });

  it('rejects duplicate worker phone numbers', async () => {
    const admin = await login(ADMIN_PHONE);
    await api().post('/api/admin/workers').set(auth(admin.token)).send(newWorker).expect(201);
    await api().post('/api/admin/workers').set(auth(admin.token)).send(newWorker).expect(409);
  });

  it('filters public listings by service and locality', async () => {
    await createWorker({ services: ['COOKING'], locality: 'Dayal Bagh' });
    await createWorker({ services: ['CLEANING'], locality: 'Tajganj' });
    const r = await api().get('/api/workers?service=COOKING&locality=dayal').expect(200);
    expect(r.body.workers).toHaveLength(1);
    expect(r.body.workers[0].locality).toBe('Dayal Bagh');
  });
});

describe('admin: booking lifecycle', () => {
  async function requested() {
    const worker = await createWorker();
    const household = await login();
    const r = await api()
      .post('/api/bookings')
      .set(auth(household.token))
      .send({ type: 'ONE_TIME', workerId: worker.id, service: 'CLEANING', date: inDays(3), startTime: '09:00', endTime: '11:00', address: '45 Sanjay Place, Agra' })
      .expect(201);
    return { id: r.body.booking.id as string, household };
  }

  it('confirms a requested booking and records who did it', async () => {
    const admin = await login(ADMIN_PHONE);
    const { id, household } = await requested();
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'CONFIRMED', note: 'Called worker' }).expect(200);

    const detail = await api().get(`/api/bookings/${id}`).set(auth(household.token)).expect(200);
    expect(detail.body.booking.status).toBe('CONFIRMED');
    expect(detail.body.booking.events.at(-1)).toMatchObject({ fromStatus: 'REQUESTED', toStatus: 'CONFIRMED', note: 'Called worker' });
  });

  it('households cannot confirm their own bookings', async () => {
    const { id, household } = await requested();
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(household.token)).send({ to: 'CONFIRMED' }).expect(403);
  });

  it('rejects invalid transitions', async () => {
    const admin = await login(ADMIN_PHONE);
    const { id } = await requested();
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'REJECTED' }).expect(200);
    const r = await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'CONFIRMED' }).expect(409);
    expect(r.body.error.code).toBe('INVALID_TRANSITION');
  });

  it("can't complete a booking before it starts", async () => {
    const admin = await login(ADMIN_PHONE);
    const { id } = await requested();
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'CONFIRMED' }).expect(200);
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'COMPLETED' }).expect(400);
  });

  it('lists bookings with contact details and reports dashboard stats', async () => {
    const admin = await login(ADMIN_PHONE);
    const { id } = await requested();
    await requested();
    await api().post(`/api/admin/bookings/${id}/transition`).set(auth(admin.token)).send({ to: 'CONFIRMED' }).expect(200);

    const list = await api().get('/api/admin/bookings?status=REQUESTED').set(auth(admin.token)).expect(200);
    expect(list.body.bookings).toHaveLength(1);
    expect(list.body.bookings[0].worker.phone).toMatch(/^\d{10}$/);

    const stats = await api().get('/api/admin/stats').set(auth(admin.token)).expect(200);
    expect(stats.body).toMatchObject({
      workers: { active: 2, verified: 2 },
      bookings: { awaitingConfirmation: 1, byStatus: { REQUESTED: 1, CONFIRMED: 1 }, last30Days: { confirmedOrCompleted: 1, feesRupees: 49 } },
    });
  });
});
