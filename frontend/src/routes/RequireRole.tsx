import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { LoadingState } from '../components/ui';
import { canAccess, rolesForPath } from '../policy/policy';
import { useSession } from '../session/session-context';

/**
 * Route guard driven by the shared policy. Logged out -> sign in (and come back).
 * Signed in with another role -> 403. The server enforces the same rules for the API.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <PageContainer>
        <LoadingState label="Checking your session…" className="py-2xl" />
      </PageContainer>
    );
  }

  if (status === 'anonymous' || !user) {
    const target = location.pathname + location.search;
    const params = new URLSearchParams({ next: target });
    const [role] = rolesForPath(location.pathname);
    if (role) params.set('role', role);
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
