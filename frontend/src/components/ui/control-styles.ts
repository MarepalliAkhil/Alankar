import { cn } from '../../lib/cn';

export function controlClasses(hasError: boolean, extra?: string): string {
  return cn(
    // 16px below 1024px wide: iPhones and iPads zoom into any field with smaller text.
    'h-11 w-full rounded-input border bg-surface px-4 text-[16px] lg:text-sm text-text placeholder:text-text-muted',
    'transition-colors duration-base ease-brand focus-visible:shadow-focus focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    hasError ? 'border-danger-strong' : 'border-border hover:border-primary-light',
    extra,
  );
}

/** aria-describedby value for a control rendered inside <Field>. */
export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
