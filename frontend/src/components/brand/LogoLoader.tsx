import { cn } from '../../lib/cn';
import { AlankarLogo } from './AlankarLogo';
import './brand.css';

const SIZES = { small: 'h-5 w-5', medium: 'h-12 w-12', 'full-page': 'h-20 w-20' } as const;
export type LogoLoaderSize = keyof typeof SIZES;

/**
 * The bubbling A: the filled monogram with a gentle pulse and small bubbles rising around it
 * (transform and opacity only). With reduced motion: the still A with a soft fade.
 */
export function LogoLoader({
  size = 'medium',
  label = 'Loading',
  className,
}: {
  size?: LogoLoaderSize;
  label?: string;
  className?: string;
}) {
  const mark = (
    <span className={cn('logo-loader text-primary-hover', SIZES[size])} aria-hidden="true">
      <AlankarLogo className="logo-loader-mark" />
      <span className="logo-loader-bubble" />
      <span className="logo-loader-bubble" />
      <span className="logo-loader-bubble" />
      <span className="logo-loader-bubble" />
    </span>
  );
  if (size === 'full-page') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className={cn('fixed inset-0 z-overlay grid place-items-center bg-background', className)}
      >
        {mark}
      </div>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('inline-flex items-center', className)}
    >
      {mark}
    </span>
  );
}

/**
 * A reserved small slot for the loader next to an existing "Loading…" line: always the same size
 * (nothing shifts), the bubbling A appears in it only when `visible` (see `useDelayedLoading`).
 */
export function LoaderSlot({ visible, label = 'Loading' }: { visible: boolean; label?: string }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0" data-loader-slot="">
      {visible && <LogoLoader size="small" label={label} />}
    </span>
  );
}
