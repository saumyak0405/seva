import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatSchedule, rupees, serviceLabel } from '../lib/format';
import type { BookingWithWorker } from '../lib/types';
import { Empty, ErrorNote, PageTitle, Spinner, StatusBadge } from '../components/ui';

export function MyBookingsPage() {
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const bookings = useQuery({
    queryKey: ['bookings', tab],
    queryFn: () => api<{ bookings: BookingWithWorker[] }>(`/bookings?status=${tab}`).then((r) => r.bookings),
  });

  return (
    <div>
      <PageTitle title="My bookings" action={<Link to="/workers" className="btn-primary">New booking</Link>} />

      <div className="mb-4 flex gap-1">
        {(['active', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
          >
            {t === 'active' ? 'Upcoming & active' : 'Past'}
          </button>
        ))}
      </div>

      {bookings.isPending ? (
        <Spinner />
      ) : bookings.error ? (
        <ErrorNote error={bookings.error} />
      ) : bookings.data.length === 0 ? (
        <Empty title={tab === 'active' ? 'No active bookings' : 'No past bookings'}>
          <Link to="/workers" className="text-brand-700 hover:underline">
            Find a verified worker
          </Link>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.data.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-brand-600">
                <div>
                  <div className="font-medium text-stone-900">
                    {serviceLabel(b.service)} with {b.worker.name}
                  </div>
                  <div className="text-sm text-stone-500">{formatSchedule(b.schedule)}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-stone-600">
                    {rupees(b.priceRupees)}
                    {b.type === 'MONTHLY' && '/month'}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
