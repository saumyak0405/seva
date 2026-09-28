import { Link } from 'react-router-dom';
import { SERVICES } from '../lib/format';

const STEPS = [
  { title: 'Pick a verified worker', text: 'Every worker is met in person and ID-checked by the Seva team before they are listed.' },
  { title: 'Book a slot or hire monthly', text: 'Choose a one-time visit or a fixed daily slot every month. You see the price upfront.' },
  { title: 'We confirm by phone', text: 'Our team calls the worker and confirms your booking. You pay them directly for their work.' },
];

export function HomePage() {
  return (
    <div className="flex flex-col gap-16">
      <section className="grid items-center gap-8 pt-4 md:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-brand-700">Now in Agra</p>
          <h1 className="text-4xl font-bold leading-tight text-stone-900 sm:text-5xl">Trusted help for your home.</h1>
          <p className="mt-4 max-w-md text-lg text-stone-600">
            Book verified maids, cooks, babysitters and caregivers in your neighbourhood — for a day or every day.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/workers" className="btn-primary px-5 py-2.5 text-base">
              Find help near you
            </Link>
            <a href="#how" className="btn-secondary px-5 py-2.5 text-base">
              How it works
            </a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SERVICES.map((s) => (
            <Link
              key={s.value}
              to={`/workers?service=${s.value}`}
              className="card p-4 transition hover:border-brand-600 hover:shadow-sm"
            >
              <div className="font-semibold text-stone-900">{s.label}</div>
              <div className="mt-1 text-sm text-stone-500">{s.blurb}</div>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-20">
        <h2 className="mb-6 text-2xl font-semibold text-stone-900">How Seva works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card p-5">
              <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-accent-400 font-semibold text-stone-900">{i + 1}</div>
              <div className="font-semibold text-stone-900">{step.title}</div>
              <p className="mt-1 text-sm text-stone-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-col items-start gap-3 bg-brand-800 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Looking for work?</h2>
          <p className="text-brand-100">Domestic workers can join Seva for free. Call or WhatsApp our Agra team to register.</p>
        </div>
        <span className="rounded-lg bg-white/10 px-4 py-2 font-medium">Registration by phone</span>
      </section>
    </div>
  );
}
