import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_STYLES, rupees, serviceLabel } from '../lib/format';
import type { BookingStatus, Service, Worker } from '../lib/types';

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STATUS_STYLES[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}>{s.label}</span>;
}

export function ServiceChip({ service }: { service: Service }) {
  return <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">{serviceLabel(service)}</span>;
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700" title="Government ID verified by Seva">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 1.5l2.3 1.7 2.8-.1.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.1L10 18.5l-2.3-1.7-2.8.1-.9-2.7L1.7 12.6l.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.1L10 1.5zm3.7 6.2a.75.75 0 00-1.1-1l-3.6 4-1.6-1.6a.75.75 0 10-1.1 1.1l2.2 2.1a.75.75 0 001.1 0l4.1-4.6z"
          clipRule="evenodd"
        />
      </svg>
      ID verified
    </span>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  const cls = size === 'lg' ? 'h-16 w-16 text-xl' : 'h-12 w-12 text-base';
  return <div className={`grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800 ${cls}`}>{initials}</div>;
}

export function WorkerCard({ worker }: { worker: Worker }) {
  return (
    <Link to={`/workers/${worker.id}`} className="card flex flex-col gap-3 p-5 transition hover:border-brand-600 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar name={worker.name} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-stone-900">{worker.name}</div>
          <div className="text-sm text-stone-500">
            {worker.locality} · {worker.experienceYears} yrs experience
          </div>
          <VerifiedBadge />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {worker.services.map((s) => (
          <ServiceChip key={s} service={s} />
        ))}
      </div>
      {worker.bio && <p className="line-clamp-2 text-sm text-stone-600">{worker.bio}</p>}
      <div className="mt-auto flex items-baseline gap-3 border-t border-stone-100 pt-3 text-sm">
        <span>
          <span className="font-semibold text-stone-900">{rupees(worker.hourlyRate)}</span>
          <span className="text-stone-500">/hr</span>
        </span>
        {worker.monthlyRate != null && (
          <span>
            <span className="font-semibold text-stone-900">{rupees(worker.monthlyRate)}</span>
            <span className="text-stone-500">/month</span>
          </span>
        )}
      </div>
    </Link>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-medium text-stone-800">{title}</p>
      {children && <div className="text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="py-12 text-center text-sm text-stone-500">Loading…</div>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
