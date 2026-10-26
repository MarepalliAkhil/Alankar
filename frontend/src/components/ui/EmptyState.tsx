import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-md py-xl text-center', className)}>
      {icon && (
        <span
          aria-hidden="true"
          className="mb-md inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary-hover"
        >
          {icon}
        </span>
      )}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-lg flex flex-wrap justify-center gap-sm">{action}</div>}
    </div>
  );
}
