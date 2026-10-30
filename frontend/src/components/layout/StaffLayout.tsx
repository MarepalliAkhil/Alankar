import { LogOut } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { brand, poweredBy } from '../../config/brand';
import { cn } from '../../lib/cn';
import { menuFor, roleLabel } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { ErrorBoundary } from '../ErrorBoundary';
import { IdleGuard } from './IdleGuard';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DisplaySettings } from '../ui/DisplaySettings';
import { DelayedLoader } from '../ui/Loader';
import { PageTransition } from '../ui/PageTransition';
import { useRouteTheme } from '../../design/display';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex shrink-0 items-center justify-between gap-sm rounded-full px-md py-sm text-sm font-medium transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    isActive ? 'bg-primary text-on-primary' : 'text-text hover:bg-primary-soft',
  );

/** Staff area (receptionist, stylist, admin): a side menu built only from the role's policy. */
export function StaffLayout() {
  const { user, signOut } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useRouteTheme('staff');
  if (!user) return null;
  const menu = menuFor(user.role);

  return (
    <div className="flex min-h-screen flex-col gap-md p-sm sm:p-md lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to content
      </a>
      <aside className="glass flex flex-col gap-md rounded-card p-md lg:sticky lg:top-md lg:h-[calc(100vh-2rem)] lg:w-64 lg:self-start">
        <div className="flex items-center justify-between gap-sm">
          <Link
            to="/"
            className="rounded-full px-2 py-1 text-xl font-bold text-text focus-visible:shadow-focus focus-visible:outline-none"
          >
            {brand.logoText}
          </Link>
          <div className="flex items-center gap-xs">
            <Badge tone="primary">{roleLabel(user.role)}</Badge>
            <DisplaySettings />
          </div>
        </div>
        <nav
          aria-label={`${roleLabel(user.role)} menu`}
          className="min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {menu.map((item) => (
              <li key={item.id}>
                <NavLink to={item.path} className={itemClass} end>
                  <span>{item.label}</span>
                  {item.status === 'planned' && (
                    <span className="hidden text-xs font-normal opacity-80 lg:inline">
                      {item.task}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden shrink-0 flex-col gap-sm border-t border-border pt-md lg:flex">
          <div className="flex items-center gap-sm">
            <Avatar name={user.full_name || user.email} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{user.full_name}</p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Logout
          </Button>
          <p className="text-xs text-text-muted">{poweredBy}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          leftIcon={<LogOut className="h-4 w-4" />}
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
        >
          Logout
        </Button>
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
  );
}
