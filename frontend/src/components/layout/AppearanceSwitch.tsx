import { Contrast, Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useTheme, type ModePreference } from '../../design/theme-context';
import { cn } from '../../lib/cn';

const OPTIONS: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Device setting', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

const segment =
  'inline-flex h-8 min-w-8 flex-1 items-center justify-center rounded-full transition-colors duration-base ease-brand focus-visible:shadow-focus focus-visible:outline-none';

/**
 * Appearance as a compact switch inside the menu: system, light, dark, plus a "reduce
 * transparency" toggle. Icon-only buttons, each with its own name; the group is named
 * "Appearance". (When the sidebar is collapsed, a popover version is used instead.)
 */
export function AppearanceSwitch() {
  const { preference, reduceTransparency, setPreference, setReduceTransparency } = useTheme();
  const labelId = useId();
  return (
    <div className="flex w-full flex-col gap-1 px-md py-1 text-base font-medium text-text">
      <span id={labelId} className="truncate">
        Appearance
      </span>
      <div className="flex items-center gap-1">
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="flex flex-1 items-center gap-0.5 rounded-full border border-border p-0.5"
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              aria-label={label}
              title={label}
              onClick={() => setPreference(value)}
              className={cn(
                segment,
                preference === value
                  ? 'bg-primary-soft text-primary-hover'
                  : 'hover:bg-primary-soft',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={reduceTransparency}
          aria-label="Reduce transparency"
          title="Reduce transparency"
          onClick={() => setReduceTransparency(!reduceTransparency)}
          className={cn(
            segment,
            'w-8 flex-none border border-border',
            reduceTransparency ? 'bg-primary-soft text-primary-hover' : 'hover:bg-primary-soft',
          )}
        >
          <Contrast aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
