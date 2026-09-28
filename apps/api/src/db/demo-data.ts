/**
 * Demo data: fictional workers in Agra (names, phones and ID numbers are made up).
 * Used by `npm run db:seed` locally and by SEED_DEMO_DATA=true on the demo deployment.
 */
import { count } from 'drizzle-orm';
import { db } from './client.js';
import { users, workers } from './schema.js';
import { encryptId } from '../lib/crypto.js';
import { env } from '../config.js';

type NewWorker = typeof workers.$inferInsert;

function demoAadhaar(i: number) {
  return `9${String(100_000_000_00 + i * 7_919).padStart(11, '0')}`.slice(0, 12);
}

const demo: Omit<NewWorker, 'phone'>[] = [
  { name: 'Sunita Devi', services: ['CLEANING', 'LAUNDRY'], locality: 'Kamla Nagar', languages: ['Hindi'], experienceYears: 8, hourlyRate: 120, monthlyRate: 4500, bio: 'Morning slots preferred. Works with families in Kamla Nagar for 8 years.' },
  { name: 'Rekha Sharma', services: ['COOKING'], locality: 'Dayal Bagh', languages: ['Hindi', 'English'], experienceYears: 12, hourlyRate: 200, monthlyRate: 7000, bio: 'North Indian and Jain cooking. Can manage tiffin for small offices.' },
  { name: 'Meena Kumari', services: ['BABYSITTING', 'CLEANING'], locality: 'Tajganj', languages: ['Hindi'], experienceYears: 5, hourlyRate: 150, monthlyRate: 6000, bio: 'Experienced with toddlers; first-aid trained.' },
  { name: 'Ramesh Yadav', services: ['GARDENING', 'CLEANING'], locality: 'Civil Lines', languages: ['Hindi'], experienceYears: 10, hourlyRate: 130, monthlyRate: null, bio: 'Garden maintenance, terrace plants and deep cleaning. One-time jobs only.' },
  { name: 'Kamla Singh', services: ['ELDER_CARE', 'COOKING'], locality: 'Sikandra', languages: ['Hindi', 'Braj'], experienceYears: 15, hourlyRate: 180, monthlyRate: 8000, bio: 'Caring for elderly family members, meals and medicine reminders.' },
  { name: 'Pooja Verma', services: ['CLEANING', 'COOKING'], locality: 'Shahganj', languages: ['Hindi'], experienceYears: 3, hourlyRate: 110, monthlyRate: 4000, bio: 'Quick and reliable, available evenings.' },
  { name: 'Anita Kushwaha', services: ['LAUNDRY', 'CLEANING'], locality: 'Kamla Nagar', languages: ['Hindi'], experienceYears: 6, hourlyRate: 100, monthlyRate: 3800, bio: 'Washing, ironing and folding. Weekly or daily.' },
  { name: 'Geeta Rani', services: ['BABYSITTING', 'ELDER_CARE'], locality: 'Dayal Bagh', languages: ['Hindi', 'English'], experienceYears: 9, hourlyRate: 170, monthlyRate: 7500, bio: 'Patient and calm; references available.' },
];

const pending: Omit<NewWorker, 'phone'>[] = [
  { name: 'Savitri Bai', services: ['CLEANING'], locality: 'Tajganj', languages: ['Hindi'], experienceYears: 2, hourlyRate: 100, monthlyRate: 3500, bio: 'New to Seva — awaiting verification.' },
];

const all = [...demo.map((w) => ({ ...w, verified: true })), ...pending.map((w) => ({ ...w, verified: false }))];

/** Idempotent: safe to run on every start. Returns the number of workers in the demo set. */
export async function seedDemoData(): Promise<number> {
  for (const [i, w] of all.entries()) {
    const aadhaar = demoAadhaar(i + 1);
    await db
      .insert(workers)
      .values({
        ...w,
        phone: `70000000${String(i + 10).padStart(2, '0')}`,
        verifiedAt: w.verified ? new Date() : null,
        ...(w.verified ? { idType: 'AADHAAR' as const, idLast4: aadhaar.slice(-4), idNumberEnc: encryptId(aadhaar) } : {}),
      })
      .onConflictDoNothing({ target: workers.phone });
  }

  for (const phone of env.ADMIN_PHONES) {
    await db.insert(users).values({ phone, name: 'Seva Admin', role: 'ADMIN' }).onConflictDoNothing({ target: users.phone });
  }
  return all.length;
}

/** Seed only if there are no workers yet (fresh database). */
export async function seedIfEmpty(): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(workers);
  if (n > 0) return false;
  await seedDemoData();
  return true;
}
