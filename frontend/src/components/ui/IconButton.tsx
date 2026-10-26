import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name (icon-only buttons must have one). */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'soft';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text',
        'transition-colors duration-base ease-brand focus-visible:shadow-focus focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'ghost' ? 'hover:bg-primary-soft' : 'bg-primary-soft hover:bg-surface',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
});
