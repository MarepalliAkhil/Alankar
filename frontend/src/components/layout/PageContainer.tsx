import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-md sm:px-lg', className)}>{children}</div>;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-md py-xl sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-hover">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-bold text-text sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-base text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-sm">{actions}</div>}
    </header>
  );
}
