import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config.js';

const KEY = Buffer.from(env.ID_ENCRYPTION_KEY, 'base64');
const VERSION = 'v1';

/**
 * Encrypts a government ID number with AES-256-GCM.
 * Output format: v1.<iv>.<authTag>.<ciphertext> (each base64url).
 * The version prefix allows key rotation later.
 */
export function encryptId(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptId(payload: string): string {
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** OTPs are stored as HMAC(phone:code) so a DB leak doesn't expose live codes. */
export function hashOtp(phone: string, code: string): string {
  return createHmac('sha256', env.OTP_SECRET).update(`${phone}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
