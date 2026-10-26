import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, menuItemFor } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import PlannedPage from './PlannedPage';

const RoleHomePage = lazy(() => import('./RoleHomePage'));
const StaffManagementPage = lazy(() => import('../admin/StaffManagementPage'));

/** Picks the page for a policy path. Built pages are listed here; the rest are planned. */
export default function RolePage({ path }: { path: string }) {
  const { user } = useSession();
  if (!user) return null;
  const item = menuItemFor(user.role, path);
  if (!item) return <Navigate to="/403" replace />;
  if (path === homeFor(user.role)) return <RoleHomePage />;
  if (path === '/staff' && user.role === 'admin') return <StaffManagementPage />;
  return <PlannedPage item={item} homePath={homeFor(user.role)} />;
}
