import { Contrast, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ModePreference } from '../../design/theme-context';
import { useTheme } from '../../design/theme-context';
import { cn } from '../../lib/cn';
import { Tip } from '../layout/SidebarParts';
import { panelPlacement, rowClass } from '../layout/sidebar-styles';

const OPTIONS: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Use my device setting', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Dark / light mode and "reduce transparency", remembered in this browser. The mode defaults to
 * the device's own setting.
 */
export function DisplaySettings({
  className,
  row,
  collapsed = false,
  placement = 'side',
}: {
  className?: string;
  /** A labelled sidebar row ("Appearance") instead of the round icon button. */
  row?: boolean;
  collapsed?: boolean;
  placement?: 'side' | 'inline';
}) {
  const { preference, mode, reduceTransparency, setPreference, setReduceTransparency } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const groupId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The round (navbar) button: open the panel right under the button, keep it inside the screen
  // (shifted sideways, or flipped above when there is no room below). Offsets are relative to the
  // wrapper, so no fixed positioning is needed.
  useLayoutEffect(() => {
    if (!open || row) return;
    const place = () => {
      const root = rootRef.current;
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!root || !button || !panel) return;
      const gap = 8;
      const edge = 8;
      const anchor = button.getBoundingClientRect();
      const origin = root.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const viewWidth = document.documentElement.clientWidth;
      const room = window.innerHeight - anchor.bottom - gap - edge;
      const above = room < height && anchor.top - gap - edge >= height;
      const left = Math.max(edge, Math.min(anchor.right - width, viewWidth - width - edge));
      const top = above ? anchor.top - gap - height : anchor.bottom + gap;
      panel.style.setProperty('left', `${left - origin.left}px`);
      panel.style.setProperty('top', `${top - origin.top}px`);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, row]);

  const Current = mode === 'dark' ? Moon : Sun;
  return (
    <div
      ref={rootRef}
      className={cn(
        'relative',
        row ? (collapsed ? 'w-10' : 'w-full') : 'flex shrink-0 items-center',
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          row && !collapsed ? undefined : `Display: ${mode === 'dark' ? 'dark' : 'light'} mode`
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={row ? undefined : 'Display settings'}
        onClick={() => setOpen((v) => !v)}
        className={
          row
            ? rowClass(collapsed, open)
            : 'glass-button inline-flex h-10 w-10 items-center justify-center rounded-full text-text focus-visible:shadow-focus focus-visible:outline-none'
        }
      >
        <Current aria-hidden="true" className="h-5 w-5 shrink-0" />
        {row && !collapsed && (
          <>
            <span className="truncate">Appearance</span>
            <span className="sr-only">{`, ${mode === 'dark' ? 'dark' : 'light'} mode`}</span>
          </>
        )}
        {row && collapsed && !open && <Tip>Appearance</Tip>}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Display settings"
          className={cn(
            row ? panelPlacement(placement) : 'glass-photo absolute left-0 top-0 z-overlay',
            'flex w-64 min-w-[16rem] max-w-[calc(100vw-1rem)] flex-col gap-sm rounded-card p-md',
          )}
        >
          <p id={groupId} className="text-sm font-semibold text-text">
            Appearance
          </p>
          <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-1">
            {OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preference === value}
                onClick={() => setPreference(value)}
                className={cn(
                  'flex items-center gap-sm whitespace-nowrap rounded-nested px-sm py-2 text-left text-sm',
                  'focus-visible:shadow-focus focus-visible:outline-none',
                  preference === value
                    ? 'bg-primary-soft font-semibold text-primary-hover'
                    : 'text-text hover:bg-primary-soft',
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-sm border-t border-border pt-sm text-sm text-text">
            <input
              type="checkbox"
              checked={reduceTransparency}
              onChange={(e) => setReduceTransparency(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <Contrast aria-hidden="true" className="h-4 w-4" />
            Reduce transparency
          </label>
        </div>
      )}
    </div>
  );
}
