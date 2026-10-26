import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-primary-soft text-primary-hover hover:bg-surface',
  ghost: 'bg-transparent text-text hover:bg-primary-soft',
  danger: 'bg-danger-strong text-on-primary hover:bg-danger-text',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium',
    'transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
  );
}
