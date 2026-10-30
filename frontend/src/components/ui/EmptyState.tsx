import type { ReactNode } from 'react';
import { useTheme } from '../../design/theme-context';
import type { ThemeName } from '../../design/themes';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** A button (or two) that moves on from this empty screen. */
  action?: ReactNode;
  className?: string;
}

/** Small original line art per theme (all drawn in theme colours, no people or logos). */
function Motif({ theme }: { theme: ThemeName }) {
  switch (theme) {
    case 'salon':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M22 70 L46 30" />
          <path d="M98 70 L74 30" />
          <path d="M30 80 h60" />
          {[34, 42, 50, 58, 66, 74, 82].map((x) => (
            <path key={x} d={`M${x} 80 v8`} />
          ))}
        </g>
      );
    case 'spa':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M60 22 C50 36 50 46 60 54 C70 46 70 36 60 22 Z" />
          <path d="M28 58 C40 52 48 56 52 66 C40 70 32 66 28 58 Z" />
          <path d="M92 58 C80 52 72 56 68 66 C80 70 88 66 92 58 Z" />
          <ellipse cx="60" cy="86" rx="26" ry="5" />
        </g>
      );
    case 'parlor':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
              key={angle}
              cx="60"
              cy="38"
              rx="9"
              ry="16"
              transform={`rotate(${angle} 60 54)`}
            />
          ))}
          <circle cx="60" cy="54" r="5" />
        </g>
      );
    default:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="30" y="34" width="60" height="48" rx="8" />
          <path d="M30 48 h60" />
          <path d="M44 28 v10 M76 28 v10" />
          <path d="M60 24 l2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 z" />
        </g>
      );
  }
}

/** One empty screen: a small themed illustration, a short message and an action button. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const { theme } = useTheme();
  return (
    <div className={cn('flex flex-col items-center px-md py-xl text-center', className)}>
      <span
        aria-hidden="true"
        className="relative mb-md inline-flex h-24 w-32 items-center justify-center text-primary-light"
      >
        <svg viewBox="0 0 120 100" className="absolute inset-0 h-full w-full opacity-70">
          <ellipse cx="60" cy="52" rx="52" ry="42" className="fill-primary-soft" />
          <Motif theme={theme} />
        </svg>
        {icon && (
          <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface text-primary-hover shadow-card">
            {icon}
          </span>
        )}
      </span>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-[65ch] text-base text-text-muted">{description}</p>}
      {action && <div className="mt-lg flex flex-wrap justify-center gap-sm">{action}</div>}
    </div>
  );
}
