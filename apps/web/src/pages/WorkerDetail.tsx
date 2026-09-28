import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TIME_OPTIONS, formatDate, formatTime, hoursBetween, rupees, serviceLabel, todayIST } from '../lib/format';
import type { Booking, BookingType, BusyWindow, Service, User, Worker } from '../lib/types';
import { Avatar, ErrorNote, ServiceChip, Spinner, VerifiedBadge } from '../components/ui';

export function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const worker = useQuery({
    queryKey: ['worker', id],
    queryFn: () => api<{ worker: Worker }>(`/workers/${id}`).then((r) => r.worker),
  });

  if (worker.isPending) return <Spinner />;
  if (worker.error) return <ErrorNote error={worker.error} />;
  const w = worker.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div>
        <Link to="/workers" className="text-sm text-stone-500 hover:text-stone-800">
          ← All workers
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <Avatar name={w.name} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{w.name}</h1>
            <p className="text-stone-500">
              {w.locality}, {w.city} · {w.experienceYears} years experience
            </p>
            <VerifiedBadge />
          </div>
        </div>

        {w.bio && <p className="mt-6 text-stone-700">{w.bio}</p>}

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card p-4">
            <dt className="text-sm text-stone-500">Services</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {w.services.map((s) => (
                <ServiceChip key={s} service={s} />
              ))}
            </dd>
          </div>
          <div className="card p-4">
            <dt className="text-sm text-stone-500">Languages</dt>
            <dd className="mt-2 text-stone-800">{w.languages.join(', ') || '—'}</dd>
          </div>
          <div className="card p-4">
            <dt className="text-sm text-stone-500">One-time visits</dt>
            <dd className="mt-1 text-lg font-semibold text-stone-900">{rupees(w.hourlyRate)} / hour</dd>
          </div>
          <div className="card p-4">
            <dt className="text-sm text-stone-500">Monthly hire</dt>
            <dd className="mt-1 text-lg font-semibold text-stone-900">{w.monthlyRate != null ? `${rupees(w.monthlyRate)} / month` : 'Not available'}</dd>
          </div>
        </dl>
      </div>

      <BookingForm worker={w} />
    </div>
  );
}

function BookingForm({ worker }: { worker: Worker }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<BookingType>('ONE_TIME');
  const [service, setService] = useState<Service>(worker.services[0]);
  const [date, setDate] = useState(todayIST(1));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [address, setAddress] = useState(user?.address ?? '');
  const [notes, setNotes] = useState('');

  const availability = useQuery({
    queryKey: ['availability', worker.id, date],
    queryFn: () => api<{ busy: BusyWindow[] }>(`/workers/${worker.id}/availability?date=${date}`).then((r) => r.busy),
    enabled: Boolean(date),
  });

  const hours = hoursBetween(startTime, endTime);
  const clash = availability.data?.some((b) => startTime < b.end && b.start < endTime);
  const price = type === 'ONE_TIME' ? Math.ceil(worker.hourlyRate * hours) : worker.monthlyRate ?? 0;

  const book = useMutation({
    mutationFn: async () => {
      const common = { workerId: worker.id, service, startTime, endTime, address, notes: notes || undefined };
      const body = type === 'ONE_TIME' ? { type, date, ...common } : { type, startDate: date, ...common };
      const res = await api<{ booking: Booking }>('/bookings', { body });
      if (!user?.address) {
        const me = await api<{ user: User }>('/me', { method: 'PATCH', body: { address } }).catch(() => null);
        if (me) setUser(me.user);
      }
      return res.booking;
    },
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['availability', worker.id] });
      navigate(`/bookings/${b.id}`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: `/workers/${worker.id}` } });
      return;
    }
    book.mutate();
  };

  return (
    <form onSubmit={submit} className="card flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-20">
      <h2 className="text-lg font-semibold text-stone-900">Book {worker.name.split(' ')[0]}</h2>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
        {(['ONE_TIME', 'MONTHLY'] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={t === 'MONTHLY' && worker.monthlyRate == null}
            onClick={() => setType(t)}
            className={`rounded-md py-1.5 text-sm font-medium disabled:opacity-40 ${type === t ? 'bg-white shadow-sm' : 'text-stone-600'}`}
          >
            {t === 'ONE_TIME' ? 'One-time visit' : 'Monthly hire'}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="service">
          Service
        </label>
        <select id="service" className="input" value={service} onChange={(e) => setService(e.target.value as Service)}>
          {worker.services.map((s) => (
            <option key={s} value={s}>
              {serviceLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="date">
          {type === 'ONE_TIME' ? 'Date' : 'Start date'}
        </label>
        <input id="date" type="date" className="input" value={date} min={todayIST(type === 'ONE_TIME' ? 0 : 1)} max={todayIST(60)} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="start">
            {type === 'ONE_TIME' ? 'From' : 'Daily from'}
          </label>
          <select
            id="start"
            className="input"
            value={startTime}
            onChange={(e) => {
              const next = e.target.value;
              setStartTime(next);
              if (endTime <= next) {
                const later = TIME_OPTIONS.filter((t) => t > next);
                setEndTime(later[Math.min(7, later.length - 1)] ?? next);
              }
            }}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {formatTime(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="end">
            To
          </label>
          <select id="end" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
            {TIME_OPTIONS.filter((t) => t > startTime).map((t) => (
              <option key={t} value={t}>
                {formatTime(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {availability.data && availability.data.length > 0 && (
        <div className={`rounded-lg px-3 py-2 text-sm ${clash ? 'bg-red-50 text-red-700' : 'bg-stone-50 text-stone-600'}`}>
          <div className="font-medium">{clash ? 'Clashes with an existing booking' : `Already booked on ${formatDate(date)}`}</div>
          <ul className="mt-1">
            {availability.data.map((b) => (
              <li key={`${b.start}-${b.end}`}>
                {formatTime(b.start)} – {formatTime(b.end)}
                {b.recurring && ' (daily)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className="label" htmlFor="address">
          Address
        </label>
        <textarea id="address" className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House no., street, locality" required minLength={5} />
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 3BHK, two bathrooms" maxLength={500} />
      </div>

      <div className="rounded-lg bg-stone-50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-600">{type === 'ONE_TIME' ? `${hours > 0 ? hours : 0} hr × ${rupees(worker.hourlyRate)}` : 'Monthly rate'}</span>
          <span className="font-medium">{rupees(Math.max(price, 0))}</span>
        </div>
        <p className="mt-1 text-xs text-stone-500">You pay the worker directly. A small Seva booking fee applies once confirmed.</p>
      </div>

      <ErrorNote error={book.error} />

      {user?.role === 'ADMIN' ? (
        <p className="text-sm text-stone-500">You're logged in as Seva staff. Log in as a household to book.</p>
      ) : (
        <button type="submit" className="btn-primary py-2.5" disabled={book.isPending || clash || hours < 1}>
          {!user ? 'Log in to book' : book.isPending ? 'Sending request…' : 'Request booking'}
        </button>
      )}
    </form>
  );
}
