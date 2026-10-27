import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomerShell } from './components/layout/CustomerShell';
import { PublicLayout } from './components/layout/PublicLayout';
import { StaffLayout } from './components/layout/StaffLayout';
import { ToastProvider } from './components/ui';
import { divisions } from './config/divisions';
import { routerFuture } from './config/router';
import { rolePaths } from './policy/policy';
import { RequireRole } from './routes/RequireRole';
import { SessionProvider } from './session/SessionProvider';

const HomePage = lazy(() => import('./pages/public/HomePage'));
const DivisionPage = lazy(() => import('./pages/public/DivisionPage'));
const LoginPage = lazy(() => import('./pages/public/LoginPage'));
const RegisterPage = lazy(() => import('./pages/public/RegisterPage'));
const ZenotiansPage = lazy(() => import('./pages/public/ZenotiansPage'));
const ForbiddenPage = lazy(() => import('./pages/public/ForbiddenPage'));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage'));
const PolicyPage = lazy(() => import('./pages/public/PolicyPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const AcceptInvitePage = lazy(() => import('./pages/auth/AcceptInvitePage'));
const PayPage = lazy(() => import('./pages/customer/PayPage'));
const RolePage = lazy(() => import('./pages/app/RolePage'));
const DesignSystemPage = lazy(() => import('./pages/dev/DesignSystemPage'));
const MailboxPage = lazy(() => import('./pages/dev/MailboxPage'));

const paths = rolePaths();

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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/zenotians" element={<ZenotiansPage />} />
        <Route path="/privacy" element={<PolicyPage policy="privacy" />} />
        <Route path="/terms" element={<PolicyPage policy="terms" />} />
        <Route path="/cancellation-policy" element={<PolicyPage policy="cancellation" />} />
        <Route path="/403" element={<ForbiddenPage />} />
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}
        {import.meta.env.DEV && <Route path="/dev/mailbox" element={<MailboxPage />} />}

        {/* Customer account pages: inside the public site, guarded by the shared policy. */}
        <Route
          element={
            <RequireRole>
              <CustomerShell />
            </RequireRole>
          }
        >
          <Route path="/customer/pay/:id" element={<PayPage />} />
          <Route path="/customer/chat/:id" element={<RolePage path="/customer/chat/:id" />} />
          {paths.customer
            .filter((path) => !path.includes(':'))
            .map((path) => (
              <Route key={path} path={path} element={<RolePage path={path} />} />
            ))}
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Staff areas: one layout, menu and access from the shared policy. */}
      <Route
        element={
          <RequireRole>
            <StaffLayout />
          </RequireRole>
        }
      >
        {paths.staff.map((path) => (
          <Route key={path} path={path} element={<RolePage path={path} />} />
        ))}
      </Route>
    </Routes>
  );
}

export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = useState(
    () =>
      queryClient ??
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SessionProvider>{children}</SessionProvider>
      </ToastProvider>
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
