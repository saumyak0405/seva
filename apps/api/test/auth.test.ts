import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { otpCodes } from '../src/db/schema.js';
import { ADMIN_PHONE, api, auth, login, nextPhone, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('OTP login', () => {
  it('logs a new household in and creates their account', async () => {
    const { token, user } = await login('9876500001');
    expect(token).toBeTruthy();
    expect(user).toMatchObject({ phone: '9876500001', role: 'HOUSEHOLD' });

    const me = await api().get('/api/me').set(auth(token)).expect(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('gives configured phone numbers the admin role', async () => {
    const { user } = await login(ADMIN_PHONE);
    expect(user.role).toBe('ADMIN');
  });

  it('stores only a hash of the OTP', async () => {
    const phone = nextPhone();
    const r = await api().post('/api/auth/otp/request').send({ phone }).expect(200);
    const [row] = await db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
    expect(row.codeHash).not.toContain(r.body.devCode);
    expect(row.codeHash).toHaveLength(64);
  });

  it('rejects invalid phone numbers', async () => {
    const r = await api().post('/api/auth/otp/request').send({ phone: '12345' }).expect(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces a resend cooldown', async () => {
    const phone = nextPhone();
    await api().post('/api/auth/otp/request').send({ phone }).expect(200);
    const r = await api().post('/api/auth/otp/request').send({ phone }).expect(429);
    expect(r.body.error.code).toBe('OTP_COOLDOWN');
  });

  it('locks the code after 5 wrong attempts, even if the right code comes next', async () => {
    const phone = nextPhone();
    const r = await api().post('/api/auth/otp/request').send({ phone }).expect(200);
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await api().post('/api/auth/otp/verify').send({ phone, code: wrong }).expect(400);
    }
    const locked = await api().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
  });

  it('makes each OTP single-use', async () => {
    const phone = nextPhone();
    const r = await api().post('/api/auth/otp/request').send({ phone }).expect(200);
    await api().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    await api().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(400);
  });

  it('rejects missing or forged tokens', async () => {
    await api().get('/api/me').expect(401);
    await api().get('/api/me').set(auth('not.a.jwt')).expect(401);
  });

  it('lets users update their profile', async () => {
    const { token } = await login();
    const r = await api()
      .patch('/api/me')
      .set(auth(token))
      .send({ name: 'Asha Gupta', address: '12 MG Road, Agra', locality: 'Civil Lines' })
      .expect(200);
    expect(r.body.user).toMatchObject({ name: 'Asha Gupta', locality: 'Civil Lines' });
  });
});
