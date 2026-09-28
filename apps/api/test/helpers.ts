import request from 'supertest';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { workers } from '../src/db/schema.js';
import { encryptId } from '../src/lib/crypto.js';
import { addDays, istToday } from '../src/lib/time.js';

export const app = createApp();
export const api = () => request(app);

export const ADMIN_PHONE = '9999999999';

export async function resetDb() {
  await db.execute(sql`TRUNCATE booking_events, bookings, otp_codes, workers, users RESTART IDENTITY CASCADE`);
}

let phoneCounter = 0;
export function nextPhone() {
  phoneCounter += 1;
  return `98${String(phoneCounter).padStart(8, '0')}`;
}

/** Log in through the real OTP flow (dev mode returns the code). */
export async function login(phone = nextPhone()) {
  const r1 = await api().post('/api/auth/otp/request').send({ phone }).expect(200);
  const r2 = await api().post('/api/auth/otp/verify').send({ phone, code: r1.body.devCode }).expect(200);
  return { token: r2.body.token as string, user: r2.body.user, phone };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let workerCounter = 0;
export async function createWorker(overrides: Partial<typeof workers.$inferInsert> = {}) {
  workerCounter += 1;
  const [w] = await db
    .insert(workers)
    .values({
      name: `Test Worker ${workerCounter}`,
      phone: `70${String(workerCounter).padStart(8, '0')}`,
      services: ['CLEANING', 'COOKING'],
      locality: 'Kamla Nagar',
      hourlyRate: 120,
      monthlyRate: 4500,
      verified: true,
      verifiedAt: new Date(),
      idType: 'AADHAAR',
      idLast4: '1234',
      idNumberEnc: encryptId('123412341234'),
      ...overrides,
    })
    .returning();
  return w;
}

/** A date safely in the booking window (IST). */
export const inDays = (n: number) => addDays(istToday(), n);
