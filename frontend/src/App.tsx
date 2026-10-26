import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicLayout } from './components/layout/PublicLayout';
import { ToastProvider } from './components/ui';
import { divisions } from './config/divisions';

const HomePage = lazy(() => import('./pages/public/HomePage'));
const DivisionPage = lazy(() => import('./pages/public/DivisionPage'));
const LoginPage = lazy(() => import('./pages/public/LoginPage'));
const RegisterPage = lazy(() => import('./pages/public/RegisterPage'));
const ZenotiansPage = lazy(() => import('./pages/public/ZenotiansPage'));
const ForbiddenPage = lazy(() => import('./pages/public/ForbiddenPage'));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage'));
const DesignSystemPage = lazy(() => import('./pages/dev/DesignSystemPage'));

export const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        {divisions.map((division) => (
          <Route
            key={division.id}
            path={division.path}
            element={<DivisionPage divisionId={division.id} />}
          />
        ))}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/zenotians" element={<ZenotiansPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter future={routerFuture}>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
