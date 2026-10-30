import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import { EXTERNAL } from './model';

/** A link to another site: always rel="noopener noreferrer", opens in a new tab. */
export function Ext({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      {...EXTERNAL}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium text-primary-hover underline-offset-4 hover:underline focus-visible:shadow-focus focus-visible:outline-none',
        className,
      )}
    >
      {children}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** "Source: link, last checked: date" under every fact taken from another website. */
export function SourceNote({ url, checked }: { url?: string; checked?: string | null }) {
  if (!url) return null;
  return (
    <p className="text-sm text-text-muted">
      Source: <Ext href={url}>{new URL(url, 'https://x.invalid').host.replace(/^www\./, '')}</Ext>
      {checked ? <> · last checked: {checked}</> : null}
    </p>
  );
}

export function Bullets({ items, className }: { items?: string[]; className?: string }) {
  const rows = (items ?? []).filter((i) => i.trim());
  if (rows.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-2 text-text', className)}>
      {rows.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A vertical timeline: a rail with a dot per entry. */
export function Timeline({ children }: { children: ReactNode }) {
  return (
    <ol className="relative flex flex-col gap-md border-l-2 border-primary-light pl-lg">
      {children}
    </ol>
  );
}

export function TimelineItem({
  period,
  title,
  subtitle,
  children,
}: {
  period?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-[calc(var(--space-lg)+7px)] top-6 h-3 w-3 rounded-full border-2 border-surface bg-primary"
      />
      <Card variant="dense" className="flex flex-col gap-2">
        {period && <p className="text-sm font-semibold text-primary-hover">{period}</p>}
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {subtitle && <p className="text-text-muted">{subtitle}</p>}
        {children}
      </Card>
    </li>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full bg-primary-soft px-3 text-xs font-medium text-primary-hover">
      {children}
    </span>
  );
}
