import { describe, expect, it } from 'vitest';
import { decryptId, encryptId, hashOtp, safeEqualHex } from '../src/lib/crypto.js';
import { istDate, istMinuteOfDay, overlaps } from '../src/lib/time.js';
import { slotsClash } from '../src/services/bookings.js';
import { mayRevealOtp } from '../src/lib/otp-policy.js';

describe('OTP reveal policy', () => {
  it('never reveals OTPs in production without demo mode', () => {
    expect(mayRevealOtp({ devMode: false, demoMode: false, isAdminPhone: false })).toBe(false);
  });
  it('reveals household OTPs in demo mode but never admin ones', () => {
    expect(mayRevealOtp({ devMode: false, demoMode: true, isAdminPhone: false })).toBe(true);
    expect(mayRevealOtp({ devMode: false, demoMode: true, isAdminPhone: true })).toBe(false);
  });
  it('reveals everything in local dev mode', () => {
    expect(mayRevealOtp({ devMode: true, demoMode: false, isAdminPhone: true })).toBe(true);
  });
});

describe('ID encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const enc = encryptId('987654321012');
    expect(enc).not.toContain('987654321012');
    expect(enc.startsWith('v1.')).toBe(true);
    expect(decryptId(enc)).toBe('987654321012');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptId('987654321012')).not.toBe(encryptId('987654321012'));
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const [v, iv, tag, ct] = encryptId('987654321012').split('.');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptId([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });
});

describe('OTP hashing', () => {
  it('binds the code to the phone number', () => {
    expect(hashOtp('9876543210', '123456')).not.toBe(hashOtp('9876543211', '123456'));
    expect(safeEqualHex(hashOtp('9876543210', '123456'), hashOtp('9876543210', '123456'))).toBe(true);
  });
});

describe('IST time helpers', () => {
  it('converts UTC instants to IST date and minute', () => {
    const d = new Date('2026-10-01T20:00:00Z'); // 01:30 IST next day
    expect(istDate(d)).toBe('2026-10-02');
    expect(istMinuteOfDay(d)).toBe(90);
  });

  it('treats intervals as half-open', () => {
    expect(overlaps(480, 600, 600, 660)).toBe(false); // 8–10 and 10–11 touch but don't clash
    expect(overlaps(480, 600, 599, 660)).toBe(true);
  });
});

describe('slotsClash', () => {
  const once = (date: string, from: number, to: number) => ({ kind: 'once' as const, date, from, to });
  const daily = (fromDate: string, from: number, to: number) => ({ kind: 'daily' as const, fromDate, from, to });

  it('one-time vs one-time only clash on the same day', () => {
    expect(slotsClash(once('2026-10-05', 480, 600), once('2026-10-05', 540, 660))).toBe(true);
    expect(slotsClash(once('2026-10-05', 480, 600), once('2026-10-06', 540, 660))).toBe(false);
  });

  it('a monthly hire blocks its window on every day from its start date', () => {
    expect(slotsClash(daily('2026-10-05', 480, 600), once('2026-10-20', 540, 600))).toBe(true);
    expect(slotsClash(daily('2026-10-05', 480, 600), once('2026-10-04', 540, 600))).toBe(false);
    expect(slotsClash(daily('2026-10-05', 480, 600), once('2026-10-20', 600, 720))).toBe(false);
  });

  it('two open-ended monthly hires clash whenever their windows overlap', () => {
    expect(slotsClash(daily('2026-10-05', 480, 600), daily('2026-12-01', 570, 660))).toBe(true);
    expect(slotsClash(daily('2026-10-05', 480, 600), daily('2026-12-01', 600, 660))).toBe(false);
  });
});
