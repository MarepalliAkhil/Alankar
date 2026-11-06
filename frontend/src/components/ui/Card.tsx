import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** glass = light frosted surface, dense = more opaque (forms, tables), plain = solid. */
  variant?: 'glass' | 'dense' | 'plain';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article' | 'li';
}

const variants = {
  glass: 'glass',
  dense: 'glass-dense',
  plain: 'border border-border bg-surface shadow-card',
};

const paddings = { none: '', sm: 'p-5', md: 'p-5 sm:p-lg', lg: 'p-5 sm:p-lg' };

export function Card({
  variant = 'glass',
  padding = 'md',
  as: Tag = 'div',
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn('rounded-card', variants[variant], paddings[padding], className)}
      {...rest}
    />
  );
}
