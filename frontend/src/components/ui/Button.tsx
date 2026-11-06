import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * The request this button started is running. Pass the real pending state
   * (`mutation.isPending`): the spinner shows at once, the button is disabled and aria-busy (no
   * double submit), and it keeps its width so nothing jumps.
   */
  loading?: boolean;
  /** Short text shown while loading, e.g. "Signing in…". Defaults to the button's own label. */
  loadingText?: string;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    leftIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonClasses(variant, size, fullWidth), 'relative', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...rest}
    >
      {/* The normal content keeps its place (and the button its width) while loading. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>
        {leftIcon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2 overflow-hidden px-3">
          <Spinner size="sm" />
          {loadingText && (
            <span aria-hidden="true" className="truncate">
              {loadingText}
            </span>
          )}
          <span className="sr-only">Loading</span>
        </span>
      )}
    </button>
  );
});
