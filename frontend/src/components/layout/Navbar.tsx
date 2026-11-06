import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '../../config/brand';
import { divisions } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { cn } from '../../lib/cn';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useScrolled } from '../../hooks/useScrolled';
import { useSession } from '../../session/session-context';
import { Button } from '../ui/Button';
import { buttonClasses, type ButtonVariant } from '../ui/button-styles';
import { Drawer } from '../ui/Drawer';
import { ButtonLink } from '../ui/ButtonLink';
import { DisplaySettings } from '../ui/DisplaySettings';
import { IconButton } from '../ui/IconButton';

const activeTint = 'bg-primary-soft text-primary-hover';

/**
 * Every control in the bar is a real md button (40px high, text-sm); the side padding eases at
 * 1024px so the full signed-in row fits without wrapping.
 */
const barPad = 'whitespace-nowrap lg:px-3 xl:px-4';
const activeRing = 'ring-1 ring-primary-light';

/** A top-level link that is a real button (same height as every other control in the bar). */
const navButton =
  (variant: ButtonVariant, extra = '') =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      buttonClasses(variant, 'md'),
      barPad,
      isActive && variant !== 'primary' && cn(activeTint, variant === 'ghost' && activeRing),
      extra,
    );

/** Division links and plain links: ghost md buttons. */
const divisionClass = navButton('ghost');

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

  // Signed in: the public pages offer a way back into the account area (which has the sidebar).
  const authArea =
    status === 'loading' ? null : user ? (
      <>
        <ButtonLink to={user.home} variant="secondary" className={barPad}>
          {isCustomer ? 'My account' : 'Go to dashboard'}
        </ButtonLink>
        <Button
          variant="ghost"
          className={barPad}
          loading={signingOut}
          loadingText="Signing out…"
          onClick={() => void handleSignOut()}
        >
          Log out
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
          className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xl font-semibold leading-7 text-text focus-visible:shadow-focus focus-visible:outline-none"
        >
          {brand.logoText}
        </Link>

        <ul className="hidden shrink-0 items-center gap-1 lg:flex">
          {divisions.map((division) => (
            <li key={division.id}>
              <NavLink to={division.path} className={divisionClass}>
                {division.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden shrink-0 items-center gap-1.5 whitespace-nowrap xl:gap-sm lg:flex">
          {!isStaff && (
            <ButtonLink to={bookPath} className={barPad}>
              Book Now
            </ButtonLink>
          )}
          {authArea}
          <NavLink to="/zenotians" className={navButton('ghost')}>
            For Zenotians
          </NavLink>
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
          {user && (
            <NavLink to={user.home} className={drawerClass('secondary')}>
              {isCustomer ? 'My account' : 'Go to dashboard'}
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
              Log out
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
