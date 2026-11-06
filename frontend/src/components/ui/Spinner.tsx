import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };

/**
 * The inline loading indicator. It spins; with reduced motion it gently pulses instead (the
 * `.spinner` rules in design/index.css), so there is always visible feedback.
 */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center', className)} role={label ? 'status' : undefined}>
      <LoaderCircle aria-hidden="true" className={cn('spinner', sizes[size])} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
