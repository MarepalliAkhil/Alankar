import { Lightbulb, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Meera } from './Meera';
import type { MeeraPose } from './meera-data';
import { useTour } from './tour-context';

/**
 * A short first-visit hint at the top of a page. It appears once per person (the dismissal is
 * stored on the server), never while a tour is running, and renders nothing without a tour host.
 */
export function PageTip({
  id,
  title,
  children,
  pose = 'point',
}: {
  id: string;
  title: string;
  children: ReactNode;
  /** Meera's pose for this page; the generic "look here" tip uses her pointing. */
  pose?: MeeraPose;
}) {
  const tour = useTour();
  if (!tour || !tour.available || !tour.ready || tour.busy || tour.isDismissed(id)) return null;
  return (
    <div
      role="note"
      aria-label={`Tip: ${title}`}
      data-page-tip={id}
      data-tip-pose={pose}
      className="mb-md flex items-start gap-sm rounded-card border border-border bg-primary-soft p-md text-text"
    >
      <div className="peer flex-none empty:hidden">
        <Meera pose={pose} decorative quiet className="h-[4.5rem] aspect-[4/5]" />
      </div>
      <Lightbulb
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-primary-hover peer-[:not(:empty)]:hidden"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-text-muted">{children}</p>
      </div>
      <button
        type="button"
        aria-label={`Dismiss tip: ${title}`}
        onClick={() => tour.dismissTip(id)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface focus-visible:shadow-focus focus-visible:outline-none"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
