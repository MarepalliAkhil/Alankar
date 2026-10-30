import { useEffect, useState } from 'react';
import { brand } from '../../config/brand';
import { useTheme } from '../../design/theme-context';
import type { ThemeName } from '../../design/themes';
import { cn } from '../../lib/cn';

/** Loaders wait this long before showing, so a fast load never flashes one. */
export const LOADER_DELAY_MS = 300;

/** Salon: scissors snipping over a comb. */
function ScissorsComb() {
  return (
    <>
      <g className="loader-snip-top text-primary" fill="currentColor">
        <path d="M33 30 L56 16 Q58.5 15 57 18.5 L35.5 33.5 Z" />
        <path d="M31 33.5 L21.5 40.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="17" cy="44" r="5.5" fill="none" stroke="currentColor" strokeWidth="3" />
      </g>
      <g className="loader-snip-bottom text-primary" fill="currentColor">
        <path d="M33 34 L56 48 Q58.5 49 57 45.5 L35.5 30.5 Z" />
        <path d="M31 30.5 L21.5 23.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="17" cy="20" r="5.5" fill="none" stroke="currentColor" strokeWidth="3" />
      </g>
      <circle cx="32" cy="32" r="2.2" className="text-accent" fill="currentColor" />
      <g className="loader-comb text-accent" fill="currentColor">
        <rect x="14" y="54" width="36" height="3.2" rx="1.6" />
        {[16, 20, 24, 28, 32, 36, 40, 44, 48].map((x) => (
          <rect key={x} x={x - 0.8} y="57" width="1.6" height="5" rx="0.8" />
        ))}
      </g>
    </>
  );
}

/** Spa: a lotus breathing above spreading ripples. */
function LotusRipple() {
  return (
    <>
      <g className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.6">
        <ellipse className="loader-ripple" cx="32" cy="50" rx="22" ry="6" />
        <ellipse className="loader-ripple-late" cx="32" cy="50" rx="22" ry="6" />
      </g>
      <g className="loader-breathe text-primary" fill="currentColor">
        <path d="M32 16 C38.5 24 38.5 36 32 46 C25.5 36 25.5 24 32 16 Z" />
        <path opacity="0.85" d="M32 46 C23 44 15.5 36 14.5 27 C22 28 30 35 32 46 Z" />
        <path opacity="0.85" d="M32 46 C41 44 48.5 36 49.5 27 C42 28 34 35 32 46 Z" />
        <path opacity="0.6" d="M32 47 C21 48 11 44 7 37 C15.5 35 26 39 32 47 Z" />
        <path opacity="0.6" d="M32 47 C43 48 53 44 57 37 C48.5 35 38 39 32 47 Z" />
      </g>
    </>
  );
}

/** Beauty Parlor: a makeup brush sweeping beside a blooming flower. */
function BrushFlower() {
  return (
    <>
      <g className="loader-bloom text-accent" fill="currentColor">
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            key={angle}
            cx="18"
            cy="11"
            rx="3.6"
            ry="6"
            transform={`rotate(${angle} 18 18)`}
            opacity="0.9"
          />
        ))}
        <circle cx="18" cy="18" r="3" className="text-primary" fill="currentColor" />
      </g>
      <g className="loader-brush text-primary" fill="currentColor">
        <path d="M12 56 L35 33 L39.5 37.5 L16.5 60.5 Q13 62 12 60.5 Q10.5 58.5 12 56 Z" />
        <path opacity="0.8" d="M35 33 L41 27 L45.5 31.5 L39.5 37.5 Z" />
        <path d="M41 27 C43 18 51 12.5 57 10 C55.5 15.5 51 24 45.5 31.5 Z" />
      </g>
    </>
  );
}

const MARKS = { salon: ScissorsComb, spa: LotusRipple, parlor: BrushFlower } as const;

/** The animated brand mark for a theme. Brand and staff themes cycle through all three. */
export function BrandMark({ theme, className }: { theme: ThemeName; className?: string }) {
  if (theme === 'salon' || theme === 'spa' || theme === 'parlor') {
    const Mark = MARKS[theme];
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('h-20 w-20', className)}>
        <Mark />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('h-20 w-20', className)}>
      <g className="loader-cycle-1">
        <ScissorsComb />
      </g>
      <g className="loader-cycle-2">
        <LotusRipple />
      </g>
      <g className="loader-cycle-3">
        <BrushFlower />
      </g>
    </svg>
  );
}

/** The branded full-screen loader. */
export function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <div
      role="status"
      aria-live="polite"
      className="loader-fade fixed inset-0 z-overlay grid place-items-center bg-background"
    >
      <div className="glass-card flex flex-col items-center gap-md rounded-modal px-2xl py-xl">
        <BrandMark theme={theme} />
        <p className="text-lg font-semibold tracking-wide text-text">{brand.logoText}</p>
        <p className="text-sm text-text-muted">{label}</p>
      </div>
    </div>
  );
}

/**
 * A Suspense fallback that shows nothing for the first 300 ms and then the full-screen loader,
 * so fast loads and quick route changes never flash it.
 */
export function DelayedLoader({
  delay = LOADER_DELAY_MS,
  label,
}: {
  delay?: number;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return show ? <FullScreenLoader label={label} /> : null;
}
