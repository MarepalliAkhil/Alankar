import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '../../config/brand';
import { divisions } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { cn } from '../../lib/cn';
import { menuFor } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { ButtonLink } from '../ui/ButtonLink';
import { DisplaySettings } from '../ui/DisplaySettings';
import { DropdownMenu, type DropdownItem } from '../ui/DropdownMenu';
import { IconButton } from '../ui/IconButton';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-3 py-2 text-sm font-medium transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    isActive ? 'bg-primary-soft text-primary-hover' : 'text-text hover:bg-primary-soft',
  );

const zenotiansClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full border px-3 py-2 text-sm font-medium transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    isActive
      ? 'border-primary bg-primary-soft text-primary-hover'
      : 'border-border text-text-muted hover:border-primary-light hover:text-text',
  );

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status, user, signOut } = useSession();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCustomer = user?.role === 'customer';
  const isStaff = !!user && !isCustomer;
  const bookPath = isCustomer ? '/customer/book' : BOOK_NOW_PATH;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

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
        <ButtonLink to={user.home} size="sm" variant="secondary">
          Go to dashboard
        </ButtonLink>
        <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>
          Logout
        </Button>
      </>
    ) : (
      <>
        <NavLink to="/login" className={linkClass}>
          Login
        </NavLink>
        <NavLink to="/register" className={linkClass}>
          Register
        </NavLink>
      </>
    );

  return (
    <header className="sticky top-0 z-nav px-sm pt-sm sm:px-lg">
      <nav
        aria-label="Main"
        className="glass mx-auto flex max-w-6xl items-center gap-sm rounded-card px-md py-sm"
      >
        <Link
          to="/"
          className="mr-sm rounded-full px-2 py-1 text-xl font-bold text-text focus-visible:shadow-focus focus-visible:outline-none"
        >
          {brand.logoText}
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {divisions.map((division) => (
            <li key={division.id}>
              <NavLink to={division.path} className={linkClass}>
                {division.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          {!isStaff && (
            <ButtonLink to={bookPath} size="sm" className="mr-1">
              Book Now
            </ButtonLink>
          )}
          {authArea}
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <NavLink to="/zenotians" className={zenotiansClass}>
            For Zenotians
          </NavLink>
          <DisplaySettings className="ml-1" />
        </div>

        <DisplaySettings className="ml-auto md:hidden" />
        <IconButton
          className="md:hidden"
          label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          icon={open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          onClick={() => setOpen((value) => !value)}
        />
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="glass-dense mx-auto mt-sm flex max-w-6xl flex-col gap-1 rounded-card p-sm md:hidden"
        >
          {divisions.map((division) => (
            <NavLink key={division.id} to={division.path} className={linkClass}>
              {division.label}
            </NavLink>
          ))}
          {isCustomer &&
            accountItems.map((item) =>
              item.to !== undefined ? (
                <NavLink key={item.label} to={item.to} className={linkClass}>
                  {item.label}
                </NavLink>
              ) : null,
            )}
          {isStaff && user && (
            <NavLink to={user.home} className={linkClass}>
              Go to dashboard
            </NavLink>
          )}
          {status === 'anonymous' && (
            <>
              <NavLink to="/login" className={linkClass}>
                Login
              </NavLink>
              <NavLink to="/register" className={linkClass}>
                Register
              </NavLink>
            </>
          )}
          <NavLink to="/zenotians" className={zenotiansClass}>
            For Zenotians
          </NavLink>
          {user && (
            <Button variant="ghost" fullWidth onClick={() => void handleSignOut()}>
              Logout
            </Button>
          )}
          {!isStaff && (
            <ButtonLink to={bookPath} fullWidth className="mt-sm">
              Book Now
            </ButtonLink>
          )}
        </div>
      )}
    </header>
  );
}
