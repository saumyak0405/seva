/**
 * Load test for the Seva API.
 *
 *   1. Read throughput: concurrent GET /api/workers for a fixed duration.
 *   2. Booking storm: many households booking overlapping slots at once,
 *      then a database check that no worker ended up double-booked.
 *
 * Usage (against a running server that shares this DATABASE_URL and JWT_SECRET):
 *   BASE_URL=http://localhost:4000 npx tsx --env-file=.env scripts/loadtest.ts
 *
 * Use a throwaway database — this creates test households and bookings.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { users, workers } from '../src/db/schema.js';
import { signToken } from '../src/middleware/auth.js';
import { addDays, istToday } from '../src/lib/time.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const READ_SECONDS = Number(process.env.READ_SECONDS ?? 15);
const READ_CONCURRENCY = Number(process.env.READ_CONCURRENCY ?? 50);
const BOOKINGS = Number(process.env.BOOKINGS ?? 1000);
const BOOKING_CONCURRENCY = Number(process.env.BOOKING_CONCURRENCY ?? 50);
const HOUSEHOLDS = 100;

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function summary(latencies: number[]) {
  const s = [...latencies].sort((a, b) => a - b);
  const f = (n: number) => `${n.toFixed(1)} ms`;
  return { p50: f(percentile(s, 50)), p95: f(percentile(s, 95)), p99: f(percentile(s, 99)), max: f(s[s.length - 1]) };
}

async function timed(fn: () => Promise<Response>) {
  const t = performance.now();
  const res = await fn();
  await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - t };
}

async function readPhase() {
  const latencies: number[] = [];
  let errors = 0;
  const deadline = Date.now() + READ_SECONDS * 1000;
  await Promise.all(
    Array.from({ length: READ_CONCURRENCY }, async () => {
      while (Date.now() < deadline) {
        const r = await timed(() => fetch(`${BASE}/api/workers?service=CLEANING`));
        if (r.status === 200) latencies.push(r.ms);
        else errors++;
      }
    }),
  );
  return { requests: latencies.length + errors, rps: Math.round(latencies.length / READ_SECONDS), errors, latency: summary(latencies) };
}

async function bookingPhase() {
  // Households with signed tokens (skips the OTP flow and its rate limits).
  const phones = Array.from({ length: HOUSEHOLDS }, (_, i) => `60${String(90_000_000 + i)}`);
  await db.insert(users).values(phones.map((phone) => ({ phone, role: 'HOUSEHOLD' as const }))).onConflictDoNothing();
  const households = await db.select().from(users).where(inArray(users.phone, phones));
  const tokens = households.map((u) => signToken({ id: u.id, role: 'HOUSEHOLD' }));

  const pool_ = await db.select().from(workers).where(and(eq(workers.verified, true), eq(workers.active, true)));
  const today = istToday();

  // Random 2-hour slots between 08:00 and 19:00 over 5 days: heavy overlap on purpose.
  const requests = Array.from({ length: BOOKINGS }, (_, i) => {
    const w = pool_[Math.floor(Math.random() * pool_.length)];
    const startHalfHours = 16 + Math.floor(Math.random() * 18); // 08:00 … 16:30
    const start = startHalfHours * 30;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return {
      token: tokens[i % tokens.length],
      body: {
        type: 'ONE_TIME',
        workerId: w.id,
        service: w.services[0],
        date: addDays(today, 2 + Math.floor(Math.random() * 5)),
        startTime: hhmm(start),
        endTime: hhmm(start + 120),
        address: 'Load test, Agra',
      },
    };
  });

  const latencies: number[] = [];
  const statuses: Record<number, number> = {};
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: BOOKING_CONCURRENCY }, async () => {
      while (next < requests.length) {
        const { token, body } = requests[next++];
        const r = await timed(() =>
          fetch(`${BASE}/api/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          }),
        );
        latencies.push(r.ms);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
    }),
  );
  const seconds = (performance.now() - t0) / 1000;

  // The invariant: no two active one-time bookings for the same worker overlap.
  const [{ overlaps }] = await db.execute<{ overlaps: number }>(sql`
    select count(*)::int as overlaps
    from bookings a join bookings b
      on a.worker_id = b.worker_id and a.id < b.id
     and a.type = 'ONE_TIME' and b.type = 'ONE_TIME'
     and a.status in ('REQUESTED','CONFIRMED') and b.status in ('REQUESTED','CONFIRMED')
     and tstzrange(a.start_at, a.end_at) && tstzrange(b.start_at, b.end_at)
  `).then((r) => r.rows);

  return {
    requests: BOOKINGS,
    workers: pool_.length,
    throughput: `${Math.round(BOOKINGS / seconds)} req/s`,
    created: statuses[201] ?? 0,
    rejectedAsTaken: statuses[409] ?? 0,
    otherStatuses: Object.fromEntries(Object.entries(statuses).filter(([s]) => s !== '201' && s !== '409')),
    latency: summary(latencies),
    doubleBookingsInDb: overlaps,
  };
}

console.log(`Load testing ${BASE}\n`);
console.log(`1) Reads: ${READ_CONCURRENCY} concurrent clients for ${READ_SECONDS}s`);
console.log(await readPhase());
console.log(`\n2) Booking storm: ${BOOKINGS} overlapping booking requests, ${BOOKING_CONCURRENCY} at a time`);
const result = await bookingPhase();
console.log(result);
await pool.end();
if (result.doubleBookingsInDb !== 0) process.exit(1);
