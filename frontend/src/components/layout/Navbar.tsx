import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { brand } from '../../config/brand';
import { divisions } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { cn } from '../../lib/cn';
import { ButtonLink } from '../ui/ButtonLink';
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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
          <ButtonLink to={BOOK_NOW_PATH} size="sm" className="mr-1">
            Book Now
          </ButtonLink>
          <NavLink to="/login" className={linkClass}>
            Login
          </NavLink>
          <NavLink to="/register" className={linkClass}>
            Register
          </NavLink>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <NavLink to="/zenotians" className={zenotiansClass}>
            For Zenotians
          </NavLink>
        </div>

        <IconButton
          className="ml-auto md:hidden"
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
          <NavLink to="/login" className={linkClass}>
            Login
          </NavLink>
          <NavLink to="/register" className={linkClass}>
            Register
          </NavLink>
          <NavLink to="/zenotians" className={zenotiansClass}>
            For Zenotians
          </NavLink>
          <ButtonLink to={BOOK_NOW_PATH} fullWidth className="mt-sm">
            Book Now
          </ButtonLink>
        </div>
      )}
    </header>
  );
}
