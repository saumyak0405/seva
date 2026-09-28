import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { and, desc, eq, gt, gte, isNull, sql, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { otpCodes, users } from '../db/schema.js';
import { env } from '../config.js';
import { generateOtp, hashOtp, safeEqualHex } from '../lib/crypto.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';
import { phoneSchema } from '../lib/validation.js';
import { currentUser, requireAuth, signToken } from '../middleware/auth.js';
import { notifier } from '../services/notifications.js';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_MAX_PER_HOUR = 5;

export const authRouter = Router();

// Per-IP limit on top of the per-phone limits below.
authRouter.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
  }),
);

authRouter.post('/otp/request', async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
  const now = Date.now();

  const [recent] = await db
    .select({ n: count(), last: sql<Date | null>`max(${otpCodes.createdAt})` })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gte(otpCodes.createdAt, new Date(now - 3_600_000))));

  if (recent.n >= OTP_MAX_PER_HOUR) {
    throw new HttpError(429, 'OTP_LIMIT', 'Too many OTP requests. Try again in an hour.');
  }
  if (recent.last && now - new Date(recent.last).getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new HttpError(429, 'OTP_COOLDOWN', 'Please wait 30 seconds before requesting another OTP');
  }

  const code = generateOtp();
  await db.insert(otpCodes).values({ phone, codeHash: hashOtp(phone, code), expiresAt: new Date(now + OTP_TTL_MS) });
  await notifier.sendOtp(phone, code);

  res.json({ sent: true, expiresInSeconds: OTP_TTL_MS / 1000, ...(env.OTP_DEV_MODE ? { devCode: code } : {}) });
});

authRouter.post('/otp/verify', async (req, res) => {
  const { phone, code } = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP') }).parse(req.body);

  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!otp) throw badRequest('OTP expired or not requested', 'OTP_INVALID');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new OTP.');

  if (!safeEqualHex(otp.codeHash, hashOtp(phone, code))) {
    await db.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` }).where(eq(otpCodes.id, otp.id));
    throw badRequest('Incorrect OTP', 'OTP_INVALID');
  }

  // Conditional update makes the code single-use even under concurrent verifies.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length === 0) throw badRequest('OTP already used', 'OTP_INVALID');

  const isAdmin = env.ADMIN_PHONES.includes(phone);
  await db.insert(users).values({ phone, role: isAdmin ? 'ADMIN' : 'HOUSEHOLD' }).onConflictDoNothing({ target: users.phone });
  let [user] = await db.select().from(users).where(eq(users.phone, phone));
  if (isAdmin && user.role !== 'ADMIN') {
    [user] = await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, user.id)).returning();
  }

  res.json({ token: signToken({ id: user.id, role: user.role }), user: publicUser(user) });
});

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, currentUser(req).id));
  if (!user) throw notFound('User');
  res.json({ user: publicUser(user) });
});

meRouter.patch('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      address: z.string().trim().min(5).max(300).optional(),
      locality: z.string().trim().min(2).max(80).optional(),
    })
    .parse(req.body);
  const [user] = await db.update(users).set(body).where(eq(users.id, currentUser(req).id)).returning();
  res.json({ user: publicUser(user) });
});

function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, phone: u.phone, name: u.name, role: u.role, address: u.address, locality: u.locality };
}
