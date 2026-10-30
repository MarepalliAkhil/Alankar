import { Contrast, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ModePreference } from '../../design/theme-context';
import { useTheme } from '../../design/theme-context';
import { cn } from '../../lib/cn';

const OPTIONS: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Use my device setting', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Dark / light mode and "reduce transparency", remembered in this browser. The mode defaults to
 * the device's own setting.
 */
export function DisplaySettings({ className }: { className?: string }) {
  const { preference, mode, reduceTransparency, setPreference, setReduceTransparency } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const groupId = useId();

  useEffect(() => {
    if (!open) return;
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

  const Current = mode === 'dark' ? Moon : Sun;
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={`Display: ${mode === 'dark' ? 'dark' : 'light'} mode`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Display settings"
        onClick={() => setOpen((v) => !v)}
        className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-full text-text focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Current aria-hidden="true" className="h-5 w-5" />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Display settings"
          className="glass-panel absolute right-0 top-12 z-overlay flex w-64 flex-col gap-sm rounded-card p-md"
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
                  'flex items-center gap-sm rounded-nested px-sm py-2 text-left text-sm',
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
