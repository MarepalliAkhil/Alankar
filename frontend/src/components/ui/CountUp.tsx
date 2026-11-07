import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : true;
}

/** Animated number (count-up once it scrolls into view). Static with reduced motion. */
export function CountUp({
  value,
  suffix = '',
  startDelay = 0,
}: {
  value: number;
  suffix?: string;
  /** Wait this many milliseconds after it scrolls into view (so a sliding card lands first). */
  startDelay?: number;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setShown(value);
      return;
    }
    let frame = 0;
    let timer = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const begin = () => {
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 900);
          setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      };
      if (startDelay > 0) timer = window.setTimeout(begin, startDelay);
      else begin();
    });
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, startDelay]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">
        {shown.toLocaleString('en-IN')}
        {suffix}
      </span>
      <span className="sr-only">
        {value.toLocaleString('en-IN')}
        {suffix}
      </span>
    </span>
  );
}
