import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { SERVICES } from '../lib/format';
import type { Worker } from '../lib/types';
import { Empty, ErrorNote, PageTitle, Spinner, WorkerCard } from '../components/ui';

export function WorkersPage() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') ?? '';
  const locality = params.get('locality') ?? '';
  const page = Number(params.get('page') ?? 1);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const localities = useQuery({
    queryKey: ['localities'],
    queryFn: () => api<{ localities: string[] }>('/workers/localities'),
  });

  const qs = new URLSearchParams({ ...(service && { service }), ...(locality && { locality }), page: String(page) });
  const workers = useQuery({
    queryKey: ['workers', service, locality, page],
    queryFn: () => api<{ workers: Worker[]; hasMore: boolean }>(`/workers?${qs}`),
  });

  return (
    <div>
      <PageTitle title="Find help" subtitle="All workers below are ID-verified by the Seva team." />

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <select className="input" value={service} onChange={(e) => update('service', e.target.value)} aria-label="Service">
          <option value="">All services</option>
          {SERVICES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="input" value={locality} onChange={(e) => update('locality', e.target.value)} aria-label="Locality">
          <option value="">All localities</option>
          {localities.data?.localities.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {(service || locality) && (
          <button className="btn-secondary" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        )}
      </div>

      {workers.isPending ? (
        <Spinner />
      ) : workers.error ? (
        <ErrorNote error={workers.error} />
      ) : workers.data.workers.length === 0 ? (
        <Empty title="No workers match these filters yet">Try another locality or service. We're onboarding new workers every week.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workers.data.workers.map((w) => (
              <WorkerCard key={w.id} worker={w} />
            ))}
          </div>
          {(page > 1 || workers.data.hasMore) && (
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>
                Previous
              </button>
              <button className="btn-secondary" disabled={!workers.data.hasMore} onClick={() => update('page', String(page + 1))}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
