import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { STATUS_STYLES, formatSchedule, rupees, serviceLabel } from '../lib/format';
import type { BookingDetail } from '../lib/types';
import { Avatar, ErrorNote, Spinner, StatusBadge } from '../components/ui';

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const booking = useQuery({
    queryKey: ['bookings', 'detail', id],
    queryFn: () => api<{ booking: BookingDetail }>(`/bookings/${id}`).then((r) => r.booking),
  });

  const cancel = useMutation({
    mutationFn: () => api(`/bookings/${id}/cancel`, { body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });

  if (booking.isPending) return <Spinner />;
  if (booking.error) return <ErrorNote error={booking.error} />;
  const b = booking.data;
  const canCancel = user?.id === b.householdId && (b.status === 'REQUESTED' || b.status === 'CONFIRMED');

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={user?.role === 'ADMIN' ? '/admin' : '/bookings'} className="text-sm text-stone-500 hover:text-stone-800">
        ← Back
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {serviceLabel(b.service)} · {b.type === 'MONTHLY' ? 'Monthly hire' : 'One-time visit'}
            </h1>
            <p className="text-stone-500">{formatSchedule(b.schedule)}</p>
          </div>
          <StatusBadge status={b.status} />
        </div>

        {b.status === 'REQUESTED' && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Our team will call {b.worker.name.split(' ')[0]} and confirm your booking shortly.
          </p>
        )}

        <div className="mt-6 flex items-center gap-3 border-t border-stone-100 pt-6">
          <Avatar name={b.worker.name} />
          <div>
            <Link to={`/workers/${b.worker.id}`} className="font-medium text-stone-900 hover:underline">
              {b.worker.name}
            </Link>
            <div className="text-sm text-stone-500">{b.worker.locality}</div>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Address</dt>
            <dd className="text-stone-800">{b.address}</dd>
          </div>
          {b.notes && (
            <div>
              <dt className="text-stone-500">Notes</dt>
              <dd className="text-stone-800">{b.notes}</dd>
            </div>
          )}
          <div>
            <dt className="text-stone-500">Pay the worker</dt>
            <dd className="text-stone-800">
              {rupees(b.priceRupees)}
              {b.type === 'MONTHLY' && ' / month'}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Seva booking fee</dt>
            <dd className="text-stone-800">{rupees(b.feeRupees)}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-stone-100 pt-6">
          <h2 className="mb-3 text-sm font-medium text-stone-500">History</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {b.events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-36 shrink-0 text-stone-400">
                  {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="text-stone-700">
                  {e.fromStatus ? STATUS_STYLES[e.toStatus].label : 'Booking requested'}
                  {e.note && <span className="text-stone-500"> — {e.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {canCancel && (
          <div className="mt-6 flex flex-col gap-2 border-t border-stone-100 pt-6">
            <ErrorNote error={cancel.error} />
            <button className="btn-danger self-start" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? 'Cancelling…' : b.type === 'MONTHLY' ? 'End monthly hire' : 'Cancel booking'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
