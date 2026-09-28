import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth';
import { ApiError } from './lib/api';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { HomePage } from './pages/Home';
import { WorkersPage } from './pages/Workers';
import { WorkerDetailPage } from './pages/WorkerDetail';
import { LoginPage } from './pages/Login';
import { MyBookingsPage } from './pages/MyBookings';
import { BookingDetailPage } from './pages/BookingDetail';
import { AdminDashboardPage } from './pages/admin/Dashboard';
import { AdminWorkersPage } from './pages/admin/Workers';
import { NotFoundPage } from './pages/NotFound';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="workers" element={<WorkersPage />} />
              <Route path="workers/:id" element={<WorkerDetailPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route
                path="bookings"
                element={
                  <RequireAuth role="HOUSEHOLD">
                    <MyBookingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="bookings/:id"
                element={
                  <RequireAuth>
                    <BookingDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="admin"
                element={
                  <RequireAuth role="ADMIN">
                    <AdminDashboardPage />
                  </RequireAuth>
                }
              />
              <Route
                path="admin/workers"
                element={
                  <RequireAuth role="ADMIN">
                    <AdminWorkersPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
