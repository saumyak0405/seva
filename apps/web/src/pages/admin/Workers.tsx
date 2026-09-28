import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { SERVICES, rupees, serviceLabel } from '../../lib/format';
import type { AdminWorker, IdType, Service } from '../../lib/types';
import { ErrorNote, PageTitle, Spinner } from '../../components/ui';

const ID_TYPES: { value: IdType; label: string; hint: string }[] = [
  { value: 'AADHAAR', label: 'Aadhaar', hint: '12 digits' },
  { value: 'VOTER_ID', label: 'Voter ID', hint: 'e.g. ABC1234567' },
  { value: 'PAN', label: 'PAN', hint: 'e.g. ABCDE1234F' },
  { value: 'DRIVING_LICENCE', label: 'Driving licence', hint: 'e.g. UP8020190001234' },
];

export function AdminWorkersPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const workers = useQuery({
    queryKey: ['admin', 'workers'],
    queryFn: () => api<{ workers: AdminWorker[] }>('/admin/workers').then((r) => r.workers),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api(`/admin/workers/${id}/verify`, { body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/admin/workers/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <div>
      <PageTitle
        title="Workers"
        subtitle="Onboard workers after meeting them and checking their ID."
        action={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Add worker'}
          </button>
        }
      />

      {showForm && <AddWorkerForm onDone={() => setShowForm(false)} />}
      <ErrorNote error={verify.error ?? setActive.error} />

      {workers.isPending ? (
        <Spinner />
      ) : workers.error ? (
        <ErrorNote error={workers.error} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Rates</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {workers.data.map((w) => (
                <tr key={w.id} className={w.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900">{w.name}</div>
                    <div className="text-stone-500">
                      {w.locality} · {w.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{w.services.map(serviceLabel).join(', ')}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {rupees(w.hourlyRate)}/hr
                    {w.monthlyRate != null && <div>{rupees(w.monthlyRate)}/mo</div>}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{w.hasIdOnFile ? `${w.idType?.replace('_', ' ')} ••${w.idLast4}` : <span className="text-red-600">Missing</span>}</td>
                  <td className="px-4 py-3">
                    {w.verified ? (
                      <span className="text-brand-700">Verified</span>
                    ) : (
                      <span className="text-amber-700">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {!w.verified && (
                        <button className="btn-primary px-3 py-1" disabled={!w.hasIdOnFile || verify.isPending} onClick={() => verify.mutate(w.id)}>
                          Verify
                        </button>
                      )}
                      <button className="btn-secondary px-3 py-1" disabled={setActive.isPending} onClick={() => setActive.mutate({ id: w.id, active: !w.active })}>
                        {w.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddWorkerForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    locality: '',
    languages: 'Hindi',
    experienceYears: '0',
    hourlyRate: '120',
    monthlyRate: '',
    bio: '',
    idType: 'AADHAAR' as IdType,
    idNumber: '',
  });
  const [services, setServices] = useState<Service[]>([]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () =>
      api('/admin/workers', {
        body: {
          name: form.name,
          phone: form.phone,
          services,
          locality: form.locality,
          languages: form.languages.split(',').map((l) => l.trim()).filter(Boolean),
          experienceYears: Number(form.experienceYears),
          hourlyRate: Number(form.hourlyRate),
          monthlyRate: form.monthlyRate ? Number(form.monthlyRate) : null,
          bio: form.bio || undefined,
          id: form.idNumber ? { type: form.idType, number: form.idNumber } : undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Full name">
        <input className="input" value={form.name} onChange={set('name')} required minLength={2} />
      </Field>
      <Field label="Mobile number">
        <input className="input" value={form.phone} onChange={set('phone')} inputMode="numeric" maxLength={10} required />
      </Field>
      <Field label="Locality">
        <input className="input" value={form.locality} onChange={set('locality')} placeholder="e.g. Kamla Nagar" required />
      </Field>
      <Field label="Languages (comma-separated)">
        <input className="input" value={form.languages} onChange={set('languages')} />
      </Field>
      <div className="sm:col-span-2">
        <span className="label">Services</span>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => {
            const on = services.includes(s.value);
            return (
              <button
                type="button"
                key={s.value}
                onClick={() => setServices((cur) => (on ? cur.filter((x) => x !== s.value) : [...cur, s.value]))}
                className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-stone-700 ring-stone-300'}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Experience (years)">
        <input className="input" type="number" min={0} max={50} value={form.experienceYears} onChange={set('experienceYears')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hourly rate (₹)">
          <input className="input" type="number" min={50} max={2000} value={form.hourlyRate} onChange={set('hourlyRate')} required />
        </Field>
        <Field label="Monthly rate (₹)">
          <input className="input" type="number" min={1000} value={form.monthlyRate} onChange={set('monthlyRate')} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Government ID">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <select className="input" value={form.idType} onChange={set('idType')}>
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={form.idNumber}
            onChange={set('idNumber')}
            placeholder={ID_TYPES.find((t) => t.value === form.idType)?.hint}
            autoComplete="off"
          />
        </div>
        <p className="mt-1 text-xs text-stone-500">Encrypted before storage. Only the last 4 digits are ever shown.</p>
      </Field>
      <Field label="Short bio">
        <input className="input" value={form.bio} onChange={set('bio')} maxLength={500} placeholder="Shown to households" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={create.isPending || services.length === 0}>
          {create.isPending ? 'Saving…' : 'Save worker'}
        </button>
        <ErrorNote error={create.error} />
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
