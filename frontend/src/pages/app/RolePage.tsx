import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, menuItemFor } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import PlannedPage from './PlannedPage';

const RoleHomePage = lazy(() => import('./RoleHomePage'));
const StaffManagementPage = lazy(() => import('../admin/StaffManagementPage'));
const ServicesPage = lazy(() => import('../admin/ServicesPage'));
const AdminInventoryPage = lazy(() => import('../admin/AdminInventoryPage'));
const ContentPage = lazy(() => import('../admin/ContentPage'));
const MarketingPage = lazy(() => import('../admin/MarketingPage'));
const ReportsPage = lazy(() => import('../admin/ReportsPage'));
const AuditLogPage = lazy(() => import('../admin/AuditLogPage'));
const SecurityPage = lazy(() => import('../admin/SecurityPage'));
const PackagesPage = lazy(() => import('../admin/PackagesPage'));
const GiftCardsPage = lazy(() => import('../admin/GiftCardsPage'));
const AdminWaitlistPage = lazy(() => import('../admin/AdminWaitlistPage'));
const RatingsPage = lazy(() => import('../admin/RatingsPage'));
const WorkHoursPage = lazy(() => import('../admin/WorkHoursPage'));
const PayrollPage = lazy(() => import('../admin/PayrollPage'));
const StaffSummaryPage = lazy(() => import('../admin/StaffSummaryPage'));
const WalletPage = lazy(() => import('../customer/WalletPage'));
const WaitlistPage = lazy(() => import('../customer/WaitlistPage'));
const SettingsPage = lazy(() => import('../admin/SettingsPage'));
const DeskAppointmentsPage = lazy(() => import('../desk/DeskAppointmentsPage'));
const BookPage = lazy(() => import('../customer/BookPage'));
const AppointmentsPage = lazy(() => import('../customer/AppointmentsPage'));
const InvoicesPage = lazy(() => import('../customer/InvoicesPage'));
const SchedulePage = lazy(() => import('../desk/SchedulePage'));
const CustomersPage = lazy(() => import('../desk/CustomersPage'));
const CustomerProfilePage = lazy(() => import('../desk/CustomerProfilePage'));
const MyHoursPage = lazy(() => import('../desk/MyHoursPage'));
const PosPage = lazy(() => import('../desk/PosPage'));
const CashClosePage = lazy(() => import('../desk/CashClosePage'));
const InventoryPage = lazy(() => import('../desk/InventoryPage'));
const MyDayPage = lazy(() => import('../stylist/MyDayPage'));
const MyAppointmentsPage = lazy(() => import('../stylist/MyAppointmentsPage'));
const AppointmentDetailPage = lazy(() => import('../stylist/AppointmentDetailPage'));
const MySchedulePage = lazy(() => import('../stylist/MySchedulePage'));
const EarningsPage = lazy(() => import('../stylist/EarningsPage'));
const ChatPage = lazy(() => import('../chat/ChatPage'));
const ProfilePage = lazy(() => import('../customer/ProfilePage'));

/** Picks the page for a policy path. Built pages are listed here; the rest are planned. */
export default function RolePage({ path }: { path: string }) {
  const { user } = useSession();
  if (!user) return null;
  const isDesk = user.role === 'receptionist' || user.role === 'admin';
  if (path === '/customers/:id' && isDesk) return <CustomerProfilePage />;
  if (path === '/my-appointments/:id' && user.role === 'stylist') return <AppointmentDetailPage />;
  if (user.role === 'stylist' && (path === '/chat' || path === '/chat/:id')) {
    return <ChatPage base="/chat" />;
  }
  if (user.role === 'customer' && (path === '/customer/chat' || path === '/customer/chat/:id')) {
    return <ChatPage base="/customer/chat" />;
  }
  const item = menuItemFor(user.role, path);
  if (!item) return <Navigate to="/403" replace />;
  if (path === '/my-day' && user.role === 'stylist') return <MyDayPage />;
  if (path === homeFor(user.role)) return <RoleHomePage />;
  if (user.role === 'stylist') {
    if (path === '/my-appointments') return <MyAppointmentsPage />;
    if (path === '/my-schedule') return <MySchedulePage />;
    if (path === '/earnings') return <EarningsPage />;
  }
  if (path === '/staff' && user.role === 'admin') return <StaffManagementPage />;
  if (path === '/ratings' && user.role === 'admin') return <RatingsPage />;
  if (path === '/work-hours' && user.role === 'admin') return <WorkHoursPage />;
  if (path === '/payroll' && user.role === 'admin') return <PayrollPage />;
  if (path === '/staff-summary' && user.role === 'admin') return <StaffSummaryPage />;
  if (path === '/services' && user.role === 'admin') return <ServicesPage />;
  if (path === '/inventory' && user.role === 'admin') return <AdminInventoryPage />;
  if (path === '/settings' && user.role === 'admin') return <SettingsPage />;
  if (path === '/content' && user.role === 'admin') return <ContentPage />;
  if (path === '/marketing' && user.role === 'admin') return <MarketingPage />;
  if (path === '/reports' && user.role === 'admin') return <ReportsPage />;
  if (path === '/audit-log' && user.role === 'admin') return <AuditLogPage />;
  if (path === '/security' && user.role === 'admin') return <SecurityPage />;
  if (path === '/packages' && user.role === 'admin') return <PackagesPage />;
  if (path === '/gift-cards' && user.role === 'admin') return <GiftCardsPage />;
  if (path === '/waitlist' && user.role === 'admin') return <AdminWaitlistPage />;
  if (path === '/customer/wallet' && user.role === 'customer') return <WalletPage />;
  if (path === '/customer/waitlist' && user.role === 'customer') return <WaitlistPage />;
  if (path === '/customer/book' && user.role === 'customer') return <BookPage />;
  if (path === '/customer/appointments' && user.role === 'customer') return <AppointmentsPage />;
  if (path === '/customer/invoices' && user.role === 'customer') return <InvoicesPage />;
  if (path === '/customer/profile' && user.role === 'customer') return <ProfilePage />;
  if (path === '/schedule' && (user.role === 'receptionist' || user.role === 'admin')) {
    return <SchedulePage />;
  }
  if (path === '/my-hours' && user.role === 'receptionist') return <MyHoursPage />;
  if (path === '/pos' && isDesk) return <PosPage />;
  if (path === '/cash-close' && user.role === 'receptionist') return <CashClosePage />;
  if (path === '/inventory' && user.role === 'receptionist') return <InventoryPage />;
  if (path === '/customers' && isDesk) return <CustomersPage />;
  if (path === '/appointments' && (user.role === 'receptionist' || user.role === 'admin')) {
    return <DeskAppointmentsPage />;
  }
  return <PlannedPage item={item} homePath={homeFor(user.role)} />;
}
