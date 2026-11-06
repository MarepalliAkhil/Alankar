import { LogOut, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePendingAction } from '../../hooks/usePendingAction';
import { cn } from '../../lib/cn';
import { profilePathFor, roleLabel } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { Avatar } from '../ui/Avatar';
import { Tip } from './SidebarParts';

const itemClass =
  'flex w-full items-center gap-sm rounded-nested px-md py-sm text-left text-sm text-text hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none';

/**
 * The profile button at the bottom of the sidebar. It opens a small menu with exactly two
 * entries, Profile and Log out; everything else lives in the sidebar menu.
 */
export function ProfileMenu({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const [logout, loggingOut] = usePendingAction(async () => {
    await signOut();
    navigate('/');
  });

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  if (!user) return null;
  const name = user.full_name || user.email;
  const role = roleLabel(user.role);

  const onMenuKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className="relative border-t border-border pt-md">
      <button
        ref={triggerRef}
        type="button"
        data-tour="profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={collapsed ? `${name}, ${role}. Account menu` : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'group relative flex items-center gap-sm rounded-full text-left transition-colors duration-base ease-brand hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none',
          collapsed ? 'h-10 w-10 justify-center' : 'w-full p-1 pr-md',
          open && 'bg-primary-soft',
        )}
      >
        <Avatar name={name} size="sm" />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text">{name}</span>
            <span className="block truncate text-xs text-text-muted">{role}</span>
            <span className="sr-only">Account menu</span>
          </span>
        )}
        {collapsed && !open && <Tip>{`${name} · ${role}`}</Tip>}
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account menu"
          onKeyDown={onMenuKey}
          className="glass-photo absolute bottom-full left-0 z-overlay mb-sm w-56 rounded-card p-1 shadow-raised"
        >
          <li role="none">
            <Link
              role="menuitem"
              to={profilePathFor(user.role)}
              className={itemClass}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <UserRound aria-hidden="true" className="h-4 w-4" />
              Profile
            </Link>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              className={itemClass}
              onClick={() => void logout()}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {loggingOut ? 'Signing out…' : 'Log out'}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
