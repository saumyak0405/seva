import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:text-stone-900'}`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ demoMode: boolean }>('/config'),
    staleTime: Infinity,
  });

  return (
    <div className="flex min-h-screen flex-col">
      {config.data?.demoMode && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-sm text-stone-900">
          <strong>Demo site:</strong> workers are fictional and no one will visit. Log in with any mobile number — the OTP is shown on screen.
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand-800">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-800 text-white">S</span>
            <span className="text-lg">Seva</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            <NavLink to="/workers" className={navClass}>
              Find help
            </NavLink>
            {user?.role === 'HOUSEHOLD' && (
              <NavLink to="/bookings" className={navClass}>
                My bookings
              </NavLink>
            )}
            {user?.role === 'ADMIN' && (
              <>
                <NavLink to="/admin" end className={navClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/workers" className={navClass}>
                  Workers
                </NavLink>
              </>
            )}
          </nav>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-stone-500 sm:inline">{user.name ?? `+91 ${user.phone}`}</span>
              <button
                className="btn-secondary px-3 py-1.5"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary px-3 py-1.5">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Seva · Agra</span>
          <span>Every worker is ID-verified by our team before they appear here.</span>
        </div>
      </footer>
    </div>
  );
}
