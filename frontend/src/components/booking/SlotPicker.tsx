import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';

export interface SlotPickerProps {
  label: string;
  slots: readonly string[];
  value: string;
  onChange: (slot: string) => void;
  /** Shown next to each time when given, e.g. the day for suggestions across days. */
  format?: (slot: string) => string;
  error?: string;
}

/** Grid of start-time buttons (one can be chosen). */
export function SlotPicker({ label, slots, value, onChange, format, error }: SlotPickerProps) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="mb-sm text-sm font-medium text-text">{label}</legend>
      <div className="grid grid-cols-3 gap-sm sm:grid-cols-4">
        {slots.map((slot) => {
          const selected = slot === value;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(slot)}
              className={cn(
                'rounded-input border px-sm py-2 text-sm font-medium transition-colors duration-base ease-brand',
                'focus-visible:shadow-focus focus-visible:outline-none',
                selected
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text hover:border-primary-light',
              )}
            >
              {(format ?? formatTime)(slot)}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs font-medium text-danger-text">{error}</p>}
    </fieldset>
  );
}
