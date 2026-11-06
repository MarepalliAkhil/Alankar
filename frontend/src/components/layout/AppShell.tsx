import { Menu } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRouteTheme } from '../../design/display';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { cn } from '../../lib/cn';
import { canCall, notificationsPathFor, roleLabel } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { ChatWidget } from '../chatbot/ChatWidget';
import { ErrorBoundary } from '../ErrorBoundary';
import { TourProvider } from '../tour/TourProvider';
import { CommandBar } from '../ui/CommandBar';
import { Drawer } from '../ui/Drawer';
import { DelayedLoader } from '../ui/Loader';
import { PageBackground } from '../ui/PageBackground';
import { PageTransition } from '../ui/PageTransition';
import { IdleGuard } from './IdleGuard';
import { NotificationBell } from './NotificationBell';
import { PageContainer } from './PageContainer';
import { Sidebar } from './Sidebar';

/**
 * The signed-in area for all four roles: ONE left sidebar (a drawer on phones) and the page.
 * There is no top bar. Public pages keep their own navbar and do not use this layout.
 */
export function AppShell() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [drawer, setDrawer] = useState(false);
  const desktop = useMediaQuery('(min-width: 1024px)');
  useRouteTheme(user?.role === 'customer' ? 'brand' : 'staff');
  useEffect(() => setDrawer(false), [pathname]);
  if (!user) return null;
  const isCustomer = user.role === 'customer';

  const page = (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<DelayedLoader label="Loading page…" />}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <TourProvider
      role={user.role}
      firstName={user.full_name.trim().split(/\s+/)[0] ?? ''}
      isPhone={!desktop}
      openMenu={setDrawer}
      onNavigate={navigate}
    >
      <div className="flex min-h-screen">
        <PageBackground />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
        >
          Skip to content
        </a>

        <aside
          aria-label={`${roleLabel(user.role)} sidebar`}
          className={cn(
            'glass-bar sticky top-md z-nav ml-md mt-md hidden h-[calc(100vh-2rem)] shrink-0 self-start rounded-card p-md lg:block',
            collapsed ? 'w-[76px]' : 'w-[260px]',
          )}
        >
          <Sidebar
            role={user.role}
            collapsed={collapsed}
            placement="side"
            onToggle={toggleCollapsed}
          />
        </aside>

        {/* The bell: the only control outside the menu. It floats in the top-right corner, with no bar
            behind it, on every screen size. Pages keep a 4rem band clear at the top for it. */}
        {canCall(user.role, 'notifications.list') && (
          <div className="fixed right-md top-md z-nav" data-floating="bell">
            <NotificationBell listPath={notificationsPathFor(user.role)} />
          </div>
        )}

        {/* Phones and tablets: one small button at the top-left, no bar. */}
        <button
          type="button"
          aria-label="Open menu"
          data-tour="menu-button"
          aria-haspopup="dialog"
          aria-expanded={drawer}
          onClick={() => setDrawer(true)}
          className="glass-button fixed left-md top-md z-nav inline-flex h-10 w-10 items-center justify-center rounded-full text-text focus-visible:shadow-focus focus-visible:outline-none lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        {user.role === 'receptionist' && <IdleGuard />}
        <main id="main" className="min-w-0 flex-1 px-md pb-24 pt-16 sm:px-lg lg:pb-lg">
          {isCustomer ? (
            <PageContainer className="px-0 sm:px-0">{page}</PageContainer>
          ) : (
            <>{page}</>
          )}
        </main>

        <CommandBar />
        {isCustomer && <ChatWidget />}
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Menu" side="left">
          <Sidebar
            role={user.role}
            collapsed={false}
            placement="inline"
            onNavigate={() => setDrawer(false)}
          />
        </Drawer>
      </div>
    </TourProvider>
  );
}
