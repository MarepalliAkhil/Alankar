import { useState } from 'react';
import { reducedMotion } from './reveal';

/**
 * Development builds only (import.meta.env.DEV): when the system reports "reduce motion", the page
 * shows everything at once, which looks like "the animation is broken". This small note says why.
 * It never appears in a production build, and it can be dismissed.
 */
export function ReducedMotionNote() {
  const [dismissed, setDismissed] = useState(false);
  if (!import.meta.env.DEV || dismissed || !reducedMotion()) return null;
  return (
    <div
      role="note"
      data-testid="zen-reduced-note"
      className="zen-noprint mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-nested border border-border bg-surface px-4 py-2 text-sm text-text"
    >
      <span>Animations are off because your system has Reduce motion turned on.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="min-h-11 rounded-nested px-3 font-medium text-primary-hover underline focus-visible:shadow-focus focus-visible:outline-none"
      >
        Dismiss
      </button>
    </div>
  );
}
