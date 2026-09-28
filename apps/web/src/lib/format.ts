import type { BookingStatus, Schedule, Service } from './types';

export const SERVICES: { value: Service; label: string; blurb: string }[] = [
  { value: 'CLEANING', label: 'Cleaning', blurb: 'Jhadu-pocha, dusting, bathrooms' },
  { value: 'COOKING', label: 'Cooking', blurb: 'Daily meals, tiffin, festive cooking' },
  { value: 'BABYSITTING', label: 'Babysitting', blurb: 'Caring, trained nannies' },
  { value: 'ELDER_CARE', label: 'Elder care', blurb: 'Company, meals, medicine reminders' },
  { value: 'LAUNDRY', label: 'Laundry', blurb: 'Washing, ironing, folding' },
  { value: 'GARDENING', label: 'Gardening', blurb: 'Plants, terrace and lawn care' },
];

export const serviceLabel = (s: Service) => SERVICES.find((x) => x.value === s)?.label ?? s;

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const STATUS_STYLES: Record<BookingStatus, { label: string; className: string }> = {
  REQUESTED: { label: 'Awaiting confirmation', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-brand-50 text-brand-800 ring-brand-100' },
  COMPLETED: { label: 'Completed', className: 'bg-stone-100 text-stone-700 ring-stone-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-stone-100 text-stone-500 ring-stone-200' },
  REJECTED: { label: 'Not available', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatSchedule(s: Schedule) {
  const window = `${formatTime(s.startTime)} – ${formatTime(s.endTime)}`;
  return 'date' in s ? `${formatDate(s.date)}, ${window}` : `Daily ${window}, from ${formatDate(s.startDate)}`;
}

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(offsetDays = 0) {
  const d = new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 15-minute time options between 06:00 and 22:00 */
export const TIME_OPTIONS = Array.from({ length: (22 - 6) * 4 + 1 }, (_, i) => {
  const min = 6 * 60 + i * 15;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
});

export function hoursBetween(start: string, end: string) {
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  return (toMin(end) - toMin(start)) / 60;
}
