import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

export type DropdownItem =
  | { label: string; to: string; onSelect?: never }
  | { label: string; onSelect: () => void; to?: never };

export interface DropdownMenuProps {
  /** Name of the menu; also read out after the trigger's visible content (the button's name comes
   * from that content, so it always contains the visible text). */
  label: string;
  trigger: ReactNode;
  items: readonly DropdownItem[];
  className?: string;
}

const itemClass =
  'block w-full rounded-nested px-md py-sm text-left text-sm text-text hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none';

/** Small menu button (e.g. the customer avatar menu). Escape or an outside click closes it. */
export function DropdownMenu({ label, trigger, items, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-sm rounded-full p-1 pr-3 text-sm font-medium text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
      >
        {trigger}
        <span className="sr-only">{label}</span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="glass-dense absolute right-0 z-overlay mt-sm flex w-56 flex-col gap-1 rounded-nested p-1"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              {item.to !== undefined ? (
                <Link
                  role="menuitem"
                  to={item.to}
                  className={itemClass}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
