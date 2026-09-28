import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { STATUS_STYLES, formatSchedule, rupees, serviceLabel } from '../../lib/format';
import type { AdminBooking, BookingStatus } from '../../lib/types';
import { Empty, ErrorNote, PageTitle, Spinner, StatusBadge } from '../../components/ui';

interface Stats {
  workers: { active: number; verified: number };
  bookings: {
    awaitingConfirmation: number;
    byStatus: Partial<Record<BookingStatus, number>>;
    last30Days: { confirmedOrCompleted: number; feesRupees: number };
  };
}

const FILTERS: (BookingStatus | '')[] = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED', ''];

export function AdminDashboardPage() {
  const [status, setStatus] = useState<BookingStatus | ''>('REQUESTED');
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<Stats>('/admin/stats') });
  const bookings = useQuery({
    queryKey: ['admin', 'bookings', status],
    queryFn: () => api<{ bookings: AdminBooking[] }>(`/admin/bookings${status ? `?status=${status}` : ''}`).then((r) => r.bookings),
  });

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Confirm new requests by calling the worker first." />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Awaiting confirmation" value={stats.data?.bookings.awaitingConfirmation} highlight />
        <Stat label="Confirmed (30 days)" value={stats.data?.bookings.last30Days.confirmedOrCompleted} />
        <Stat label="Fees earned (30 days)" value={stats.data ? rupees(stats.data.bookings.last30Days.feesRupees) : undefined} />
        <Stat label="Verified workers" value={stats.data ? `${stats.data.workers.verified} / ${stats.data.workers.active}` : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setStatus(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === f ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
          >
            {f ? STATUS_STYLES[f].label : 'All'}
            {f && stats.data?.bookings.byStatus[f] ? ` (${stats.data.bookings.byStatus[f]})` : ''}
          </button>
        ))}
      </div>

      {bookings.isPending ? (
        <Spinner />
      ) : bookings.error ? (
        <ErrorNote error={bookings.error} />
      ) : bookings.data.length === 0 ? (
        <Empty title="Nothing here" />
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.data.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string | undefined; highlight?: boolean }) {
  return (
    <div className={`card p-4 ${highlight && value ? 'border-amber-300 bg-amber-50' : ''}`}>
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-900">{value ?? '—'}</div>
    </div>
  );
}

const ACTIONS: Partial<Record<BookingStatus, { to: BookingStatus; label: string; style: string }[]>> = {
  REQUESTED: [
    { to: 'CONFIRMED', label: 'Confirm', style: 'btn-primary' },
    { to: 'REJECTED', label: 'Worker unavailable', style: 'btn-danger' },
  ],
  CONFIRMED: [
    { to: 'COMPLETED', label: 'Mark completed', style: 'btn-secondary' },
    { to: 'CANCELLED', label: 'Cancel', style: 'btn-danger' },
  ],
};

function BookingRow({ booking: b }: { booking: AdminBooking }) {
  const queryClient = useQueryClient();
  const transition = useMutation({
    mutationFn: (to: BookingStatus) => api(`/admin/bookings/${b.id}/transition`, { body: { to } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/bookings/${b.id}`} className="font-medium text-stone-900 hover:underline">
            {serviceLabel(b.service)} · {b.type === 'MONTHLY' ? 'Monthly' : 'One-time'} · {rupees(b.priceRupees)}
          </Link>
          <div className="text-sm text-stone-500">{formatSchedule(b.schedule)}</div>
          <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <span>
              Worker: {b.worker.name} ·{' '}
              <a className="text-brand-700 hover:underline" href={`tel:+91${b.worker.phone}`}>
                {b.worker.phone}
              </a>
            </span>
            <span>
              Household: {b.household.name ?? '—'} ·{' '}
              <a className="text-brand-700 hover:underline" href={`tel:+91${b.household.phone}`}>
                {b.household.phone}
              </a>
            </span>
            <span className="text-stone-500 sm:col-span-2">{b.address}</span>
          </div>
        </div>
        <StatusBadge status={b.status} />
      </div>
      {ACTIONS[b.status] && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          {ACTIONS[b.status]!.map((a) => (
            <button key={a.to} className={a.style} disabled={transition.isPending} onClick={() => transition.mutate(a.to)}>
              {a.label}
            </button>
          ))}
          <ErrorNote error={transition.error} />
        </div>
      )}
    </li>
  );
}
