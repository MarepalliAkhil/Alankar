import { cn } from '../../lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterChipsProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Single-choice filter chips (pressed state announced to screen readers). */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-sm', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors duration-base ease-brand',
              'focus-visible:shadow-focus focus-visible:outline-none',
              selected
                ? 'border-primary bg-primary-soft text-primary-hover'
                : 'border-border bg-surface text-text hover:border-primary-light',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
