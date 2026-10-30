import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Fades its content up the first time it scrolls into view (transform and opacity only).
 * Without IntersectionObserver, and with reduced motion (index.css), it is simply shown.
 */
export function Reveal({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  [key: `aria-${string}`]: string | undefined;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (shown || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);
  return (
    <Tag ref={ref} className={cn('reveal', shown && 'reveal-in', className)} {...rest}>
      {children}
    </Tag>
  );
}
