import { useState } from 'react';
import { cn } from '../../lib/cn';
import { initials } from '../../lib/initials';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    sizes[size],
    className,
  );
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(base, 'object-cover')}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(base, 'bg-primary-soft font-semibold text-primary-hover')}
    >
      {initials(name)}
    </span>
  );
}
