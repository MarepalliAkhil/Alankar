import { CornerDownLeft, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../design/theme-context';
import { useDialog } from '../../hooks/useDialog';
import { cn } from '../../lib/cn';
import { homeFor, menuFor } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { Button } from './Button';
import { OPEN_EVENT, openCommandBar } from './command-events';
import { IconButton } from './IconButton';

interface Command {
  id: string;
  label: string;
  group: 'Go to' | 'Display';
  icon?: ReactNode;
  run: () => void;
}

export interface CommandBarProps {
  /**
   * HOOK FOR ALANKAR INTELLIGENCE (Task 10, not built): when the admin assistant exists it can
   * render its answer here for the typed query. Until then this is left empty.
   */
  assistant?: (query: string) => ReactNode;
}

/**
 * Ctrl+K (Cmd+K) palette for signed-in staff and customers. It only navigates to pages the role may
 * open (the menu from shared/policy.json) and switches light/dark; it never changes data.
 */
export function CommandBar({ assistant }: CommandBarProps) {
  const { user } = useSession();
  const navigate = useNavigate();
  const { mode, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  useDialog(open, close, panel);

  useEffect(() => {
    if (!user) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [user]);

  const commands = useMemo<Command[]>(() => {
    if (!user) return [];
    const go: Command[] = [{ id: 'home', label: 'Home', path: homeFor(user.role) }]
      .concat(
        menuFor(user.role)
          .filter((item) => item.status === 'available' || item.status === 'planned')
          .map((item) => ({ id: item.id, label: item.label, path: item.path })),
      )
      .filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index)
      .map((item) => ({
        id: `go-${item.id}`,
        label: item.label,
        group: 'Go to' as const,
        run: () => navigate(item.path),
      }));
    const display: Command[] = [
      {
        id: 'mode-toggle',
        label: mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        group: 'Display',
        icon: mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        run: () => setPreference(mode === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'mode-system',
        label: 'Use my device setting for light or dark',
        group: 'Display',
        run: () => setPreference('system'),
      },
    ];
    return [...go, ...display];
  }, [user, navigate, mode, setPreference]);

  if (!user || !open) return null;
  const needle = query.trim().toLowerCase();
  const results = needle
    ? commands.filter((command) => command.label.toLowerCase().includes(needle))
    : commands;
  const current = Math.min(active, Math.max(results.length - 1, 0));
  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };
  const optionId = (index: number) => `${listId}-${index}`;

  return createPortal(
    <div className="fixed inset-0 z-overlay flex items-start justify-center px-md pt-[12vh]">
      <div aria-hidden="true" className="absolute inset-0 bg-overlay" onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
        tabIndex={-1}
        className="glass-dense relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-modal shadow-raised focus:outline-none"
      >
        <div className="flex items-center gap-sm border-b border-border px-md">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-text-muted" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? optionId(current) : undefined}
            aria-label="Search pages and settings"
            placeholder="Go to a page or change the display…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current + 1) % Math.max(results.length, 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current - 1 + results.length) % Math.max(results.length, 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(results[current]);
              }
            }}
            className="h-14 w-full bg-transparent text-base text-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-sm">
          {results.length === 0 && (
            <li className="px-md py-sm text-sm text-text-muted" role="presentation">
              Nothing matches “{query}”.
            </li>
          )}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(command)}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-sm rounded-nested px-md text-base text-text',
                index === current && 'bg-primary-soft text-primary-hover',
              )}
            >
              {command.icon}
              <span className="flex-1 truncate">{command.label}</span>
              <span className="text-xs text-text-muted">{command.group}</span>
              {index === current && <CornerDownLeft aria-hidden="true" className="h-4 w-4" />}
            </li>
          ))}
        </ul>
        {assistant?.(query)}
      </div>
    </div>,
    document.body,
  );
}

/** The top-bar button that opens the command bar (also Ctrl+K). */
export function CommandButton({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return (
      <IconButton
        variant="soft"
        label="Search pages (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        icon={<Search className="h-5 w-5" />}
        onClick={openCommandBar}
        className={className}
      />
    );
  }
  return (
    <Button
      variant="secondary"
      aria-keyshortcuts="Control+K Meta+K"
      onClick={openCommandBar}
      className={className}
      leftIcon={<Search className="h-4 w-4" />}
    >
      Search
      <kbd className="ml-1 hidden rounded-nested border border-border px-1.5 text-xs font-medium text-text-muted md:inline">
        Ctrl K
      </kbd>
    </Button>
  );
}
