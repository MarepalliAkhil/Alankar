import { ChevronsLeft, ChevronsRight, LogOut, Menu } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { brand, poweredBy } from '../../config/brand';
import { useRouteTheme } from '../../design/display';
import { useScrolled } from '../../hooks/useScrolled';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { usePendingAction } from '../../hooks/usePendingAction';
import { cn } from '../../lib/cn';
import { menuFor, roleLabel, type MenuItem } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { ErrorBoundary } from '../ErrorBoundary';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CommandBar, CommandButton } from '../ui/CommandBar';
import { DisplaySettings } from '../ui/DisplaySettings';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui/IconButton';
import { DelayedLoader } from '../ui/Loader';
import { PageBackground } from '../ui/PageBackground';
import { PageTransition } from '../ui/PageTransition';
import { IdleGuard } from './IdleGuard';
import { MenuIcon } from './menu-icons';

const itemClass =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex h-10 items-center gap-sm whitespace-nowrap rounded-full text-base font-medium transition-colors duration-base ease-brand',
      'focus-visible:shadow-focus focus-visible:outline-none',
      collapsed ? 'w-10 justify-center' : 'w-full px-md',
      isActive
        ? 'bg-primary-soft text-primary-hover ring-1 ring-primary-light'
        : 'text-text hover:bg-primary-soft',
    );

function MenuList({
  menu,
  collapsed,
  label,
}: {
  menu: MenuItem[];
  collapsed: boolean;
  label: string;
}) {
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
      <ul className={cn('flex flex-col gap-1', collapsed && 'items-center')}>
        {menu.map((item) => (
          <li key={item.id} className={collapsed ? undefined : 'w-full'}>
            <NavLink to={item.path} className={itemClass(collapsed)} end>
              <MenuIcon id={item.id} className="h-5 w-5 shrink-0" />
              <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
              {!collapsed && item.status === 'planned' && (
                <span className="ml-auto text-xs font-normal opacity-80">{item.task}</span>
              )}
              {collapsed && (
                <span
                  aria-hidden="true"
                  className="glass-panel pointer-events-none absolute left-full z-overlay ml-sm hidden whitespace-nowrap rounded-nested px-sm py-1 text-sm text-text group-hover:block group-focus-visible:block"
                >
                  {item.label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Staff area (receptionist, stylist, admin): glass top bar, collapsible icon sidebar. */
export function StaffLayout() {
  const { user, signOut } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const bar = useScrolled<HTMLDivElement>();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [drawer, setDrawer] = useState(false);
  useRouteTheme('staff');
  const [logout, loggingOut] = usePendingAction(async () => {
    await signOut();
    navigate('/');
  });
  useEffect(() => setDrawer(false), [pathname]);
  if (!user) return null;
  const menu = menuFor(user.role);
  const name = user.full_name || user.email;

  const account = (compact: boolean) => (
    <div className="flex flex-col gap-sm border-t border-border pt-md">
      <div className={cn('flex items-center gap-sm', compact && 'justify-center')}>
        <Avatar name={name} size="sm" />
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{user.full_name}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
        )}
      </div>
      {compact ? (
        <IconButton
          label="Logout"
          icon={<LogOut className="h-5 w-5" />}
          disabled={loggingOut}
          onClick={() => void logout()}
          className="self-center"
        />
      ) : (
        <Button
          variant="ghost"
          size="md"
          leftIcon={<LogOut className="h-4 w-4" />}
          loading={loggingOut}
          loadingText="Signing out…"
          onClick={() => void logout()}
        >
          Logout
        </Button>
      )}
      {!compact && <p className="text-xs text-text-muted">{poweredBy}</p>}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <PageBackground fixed="shopBackground" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-nav px-md pt-sm sm:px-lg">
        <div
          ref={bar}
          className="glass-bar mx-auto flex h-16 w-full max-w-[1440px] items-center gap-sm rounded-card px-md"
        >
          <IconButton
            className="lg:hidden"
            label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawer}
            icon={<Menu className="h-5 w-5" />}
            onClick={() => setDrawer(true)}
          />
          <Link
            to="/"
            className="rounded-full px-2 py-1 text-xl font-semibold text-text focus-visible:shadow-focus focus-visible:outline-none"
          >
            {brand.logoText}
          </Link>
          <Badge tone="primary">{roleLabel(user.role)}</Badge>
          <div id="staff-topbar-actions" className="ml-auto flex items-center gap-sm">
            <CommandButton iconOnly className="sm:hidden" />
            <CommandButton className="hidden sm:inline-flex" />
            <DisplaySettings />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-md px-md pb-lg pt-md sm:px-lg">
        <aside
          className={cn(
            'glass-bar sticky top-[5.5rem] hidden h-[calc(100vh-7rem)] shrink-0 flex-col gap-md self-start rounded-card p-md lg:flex',
            collapsed ? 'w-[72px] items-center' : 'w-[248px]',
          )}
        >
          <MenuList menu={menu} collapsed={collapsed} label={`${roleLabel(user.role)} menu`} />
          <IconButton
            label={collapsed ? 'Expand menu' : 'Collapse menu'}
            icon={
              collapsed ? (
                <ChevronsRight className="h-5 w-5" />
              ) : (
                <ChevronsLeft className="h-5 w-5" />
              )
            }
            onClick={toggleCollapsed}
            className="self-end"
          />
          {account(collapsed)}
        </aside>

        {user.role === 'receptionist' && <IdleGuard />}
        <main id="main" className="min-w-0 flex-1">
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<DelayedLoader label="Loading page…" />}>
              <PageTransition>
                <Outlet />
              </PageTransition>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <CommandBar />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Menu">
        <div className="flex h-full flex-col gap-md">
          <MenuList menu={menu} collapsed={false} label={`${roleLabel(user.role)} menu (phone)`} />
          {account(false)}
        </div>
      </Drawer>
    </div>
  );
}
