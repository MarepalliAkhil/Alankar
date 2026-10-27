import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, menuItemFor } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import PlannedPage from './PlannedPage';

const RoleHomePage = lazy(() => import('./RoleHomePage'));
const StaffManagementPage = lazy(() => import('../admin/StaffManagementPage'));
const DeskAppointmentsPage = lazy(() => import('../desk/DeskAppointmentsPage'));
const BookPage = lazy(() => import('../customer/BookPage'));
const AppointmentsPage = lazy(() => import('../customer/AppointmentsPage'));
const InvoicesPage = lazy(() => import('../customer/InvoicesPage'));
const SchedulePage = lazy(() => import('../desk/SchedulePage'));
const CustomersPage = lazy(() => import('../desk/CustomersPage'));
const CustomerProfilePage = lazy(() => import('../desk/CustomerProfilePage'));
const PosPage = lazy(() => import('../desk/PosPage'));
const CashClosePage = lazy(() => import('../desk/CashClosePage'));
const InventoryPage = lazy(() => import('../desk/InventoryPage'));
const ProfilePage = lazy(() => import('../customer/ProfilePage'));

/** Picks the page for a policy path. Built pages are listed here; the rest are planned. */
export default function RolePage({ path }: { path: string }) {
  const { user } = useSession();
  if (!user) return null;
  const isDesk = user.role === 'receptionist' || user.role === 'admin';
  if (path === '/customers/:id' && isDesk) return <CustomerProfilePage />;
  const item = menuItemFor(user.role, path);
  if (!item) return <Navigate to="/403" replace />;
  if (path === homeFor(user.role)) return <RoleHomePage />;
  if (path === '/staff' && user.role === 'admin') return <StaffManagementPage />;
  if (path === '/customer/book' && user.role === 'customer') return <BookPage />;
  if (path === '/customer/appointments' && user.role === 'customer') return <AppointmentsPage />;
  if (path === '/customer/invoices' && user.role === 'customer') return <InvoicesPage />;
  if (path === '/customer/profile' && user.role === 'customer') return <ProfilePage />;
  if (path === '/schedule' && (user.role === 'receptionist' || user.role === 'admin')) {
    return <SchedulePage />;
  }
  if (path === '/pos' && isDesk) return <PosPage />;
  if (path === '/cash-close' && user.role === 'receptionist') return <CashClosePage />;
  if (path === '/inventory' && user.role === 'receptionist') return <InventoryPage />;
  if (path === '/customers' && isDesk) return <CustomersPage />;
  if (path === '/appointments' && (user.role === 'receptionist' || user.role === 'admin')) {
    return <DeskAppointmentsPage />;
  }
  return <PlannedPage item={item} homePath={homeFor(user.role)} />;
}
