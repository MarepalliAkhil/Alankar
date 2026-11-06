import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-7xl px-md sm:px-lg', className)}>{children}</div>;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** The page's primary action, shown as a button on the right. */
  actions?: ReactNode;
  /** Optional breadcrumb: where this page sits (links to the parent pages). */
  breadcrumb?: ReadonlyArray<{ label: string; to?: string }>;
}

/** The one page header: optional breadcrumb, title, one-line description, action on the right. */
export function PageHeader({ eyebrow, title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header className="mb-lg mt-md flex flex-col gap-md border-b border-border pb-md sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
              {breadcrumb.map((crumb, index) => (
                <li key={crumb.label} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="rounded-full hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-hover">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-3xl text-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-[65ch] text-base text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-sm">{actions}</div>}
    </header>
  );
}
