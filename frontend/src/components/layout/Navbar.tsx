import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '../../config/brand';
import { divisions } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { cn } from '../../lib/cn';
import { menuFor } from '../../policy/policy';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useScrolled } from '../../hooks/useScrolled';
import { useSession } from '../../session/session-context';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { buttonClasses, type ButtonVariant } from '../ui/button-styles';
import { Drawer } from '../ui/Drawer';
import { ButtonLink } from '../ui/ButtonLink';
import { CommandButton } from '../ui/CommandBar';
import { DisplaySettings } from '../ui/DisplaySettings';
import { DropdownMenu, type DropdownItem } from '../ui/DropdownMenu';
import { IconButton } from '../ui/IconButton';

const activeTint = 'bg-primary-soft text-primary-hover';

/** A top-level link that is a real button (same height as every other control in the bar). */
const navButton =
  (variant: ButtonVariant, extra = '') =>
  ({ isActive }: { isActive: boolean }) =>
    cn(buttonClasses(variant, 'md'), isActive && variant !== 'primary' && activeTint, extra);

/** Division links: clear active state, never wrap. */
const divisionClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    buttonClasses('ghost', 'md'),
    'whitespace-nowrap font-medium',
    isActive && 'bg-primary-soft text-primary-hover ring-1 ring-primary-light',
  );

/** The same links inside the drawer: 48px tap targets, stacked. */
const drawerClass =
  (variant: ButtonVariant) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      buttonClasses(variant, 'lg'),
      'w-full justify-start',
      isActive && variant !== 'primary' && activeTint,
    );

export function Navbar() {
  const [open, setOpen] = useState(false);
  const bar = useScrolled<HTMLElement>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status, user, signOut } = useSession();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCustomer = user?.role === 'customer';
  const isStaff = !!user && !isCustomer;
  const bookPath = isCustomer ? '/customer/book' : BOOK_NOW_PATH;

  const [handleSignOut, signingOut] = usePendingAction(async () => {
    await signOut();
    navigate('/');
  });

  // Customer avatar menu: account pages from the shared policy, plus Logout.
  const accountItems: DropdownItem[] = isCustomer
    ? [
        ...menuFor('customer')
          .filter((item) => item.id !== 'book')
          .map((item) => ({
            label: item.id === 'home' ? 'My account' : item.label,
            to: item.path,
          })),
        { label: 'Logout', onSelect: () => void handleSignOut() },
      ]
    : [];

  const authArea =
    status === 'loading' ? null : isCustomer && user ? (
      <DropdownMenu
        label="Account menu"
        trigger={
          <>
            <Avatar name={user.full_name || user.email} size="sm" />
            <span className="max-w-[10rem] truncate">
              {user.full_name.split(' ')[0] || 'Account'}
            </span>
          </>
        }
        items={accountItems}
      />
    ) : isStaff && user ? (
      <>
        <ButtonLink to={user.home} variant="secondary">
          Go to dashboard
        </ButtonLink>
        <Button
          variant="ghost"
          loading={signingOut}
          loadingText="Signing out…"
          onClick={() => void handleSignOut()}
        >
          Logout
        </Button>
      </>
    ) : (
      <>
        <NavLink to="/login" className={navButton('ghost')}>
          Login
        </NavLink>
        <NavLink to="/register" className={navButton('secondary')}>
          Register
        </NavLink>
      </>
    );

  return (
    <header data-hero-follow className="sticky top-0 z-nav px-md pt-sm sm:px-lg">
      <nav
        ref={bar}
        aria-label="Main"
        className="glass-bar mx-auto flex h-16 w-full max-w-7xl items-center gap-md rounded-card px-md"
      >
        <Link
          to="/"
          className="shrink-0 rounded-full px-2 py-1 text-xl font-semibold text-text focus-visible:shadow-focus focus-visible:outline-none"
        >
          {brand.logoText}
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {divisions.map((division) => (
            <li key={division.id}>
              <NavLink to={division.path} className={divisionClass}>
                {division.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-sm lg:flex">
          {!isStaff && <ButtonLink to={bookPath}>Book Now</ButtonLink>}
          {authArea}
          <NavLink to="/zenotians" className={navButton('ghost', 'whitespace-nowrap')}>
            For Zenotians
          </NavLink>
          {isCustomer && <CommandButton iconOnly />}
          <DisplaySettings />
        </div>

        <DisplaySettings className="ml-auto lg:hidden" />
        <IconButton
          className="lg:hidden"
          label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          icon={<Menu className="h-5 w-5" />}
          onClick={() => setOpen(true)}
        />
      </nav>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu">
        <nav aria-label="Menu" className="flex flex-col gap-sm">
          {divisions.map((division) => (
            <NavLink key={division.id} to={division.path} className={drawerClass('ghost')}>
              {division.label}
            </NavLink>
          ))}
          {isCustomer &&
            accountItems.map((item) =>
              item.to !== undefined ? (
                <NavLink key={item.label} to={item.to} className={drawerClass('ghost')}>
                  {item.label}
                </NavLink>
              ) : null,
            )}
          {isStaff && user && (
            <NavLink to={user.home} className={drawerClass('secondary')}>
              Go to dashboard
            </NavLink>
          )}
          {status === 'anonymous' && (
            <>
              <NavLink to="/login" className={drawerClass('ghost')}>
                Login
              </NavLink>
              <NavLink to="/register" className={drawerClass('secondary')}>
                Register
              </NavLink>
            </>
          )}
          <NavLink to="/zenotians" className={drawerClass('ghost')}>
            For Zenotians
          </NavLink>
          {user && (
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              loading={signingOut}
              loadingText="Signing out…"
              onClick={() => void handleSignOut()}
            >
              Logout
            </Button>
          )}
          {!isStaff && (
            <ButtonLink to={bookPath} size="lg" fullWidth className="mt-sm">
              Book Now
            </ButtonLink>
          )}
        </nav>
      </Drawer>
    </header>
  );
}
