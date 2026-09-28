import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { ErrorNote } from '../components/ui';

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ devCode?: string } | null>(null);

  const request = useMutation({
    mutationFn: () => api<{ sent: boolean; devCode?: string }>('/auth/otp/request', { body: { phone } }),
    onSuccess: (r) => setSent(r),
  });

  const verify = useMutation({
    mutationFn: () => api<{ token: string; user: User }>('/auth/otp/verify', { body: { phone, code } }),
    // Setting the user re-renders this page, and the <Navigate> below sends them back to where they came from.
    onSuccess: ({ token, user }) => login(token, user),
  });

  if (user) return <Navigate to={from ?? (user.role === 'ADMIN' ? '/admin' : '/workers')} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sent) verify.mutate();
    else request.mutate();
  };

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Log in to Seva</h1>
          <p className="mt-1 text-sm text-stone-500">We'll send a one-time code to your mobile number.</p>
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Mobile number
          </label>
          <div className="flex">
            <span className="grid place-items-center rounded-l-lg border border-r-0 border-stone-300 bg-stone-50 px-3 text-sm text-stone-500">+91</span>
            <input
              id="phone"
              className="input rounded-l-none"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              disabled={Boolean(sent)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="98765 43210"
              required
            />
          </div>
        </div>

        {sent && (
          <div>
            <label className="label" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              className="input tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
            {sent.devCode && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Demo — no SMS is sent. Your code is <strong>{sent.devCode}</strong>
              </p>
            )}
            <button
              type="button"
              className="mt-2 text-sm text-brand-700 hover:underline"
              onClick={() => {
                setSent(null);
                setCode('');
                verify.reset();
              }}
            >
              Change number
            </button>
          </div>
        )}

        <ErrorNote error={request.error ?? verify.error} />

        <button type="submit" className="btn-primary py-2.5" disabled={request.isPending || verify.isPending || (sent ? code.length !== 6 : phone.length !== 10)}>
          {sent ? (verify.isPending ? 'Verifying…' : 'Verify & continue') : request.isPending ? 'Sending…' : 'Send code'}
        </button>
      </form>
    </div>
  );
}
