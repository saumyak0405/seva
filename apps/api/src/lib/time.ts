/**
 * India has a fixed UTC+05:30 offset with no daylight saving, so IST
 * conversions are plain arithmetic. All timestamps are stored in UTC.
 */
export const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

/** Calendar date in IST as YYYY-MM-DD. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Minutes after midnight IST. */
export function istMinuteOfDay(d: Date): number {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** "08:30" -> 510 */
export function parseHHMM(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export function formatHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Today's date in IST (YYYY-MM-DD). */
export function istToday(now = new Date()): string {
  return istDate(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Half-open interval overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
