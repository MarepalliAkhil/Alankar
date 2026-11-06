import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Button } from '../ui/Button';
import { ProgressPath } from './ProgressPath';
import { Meera } from './Meera';
import { SpeechBubble } from './SpeechBubble';
import { speak } from './tours';
import type { TourDefinition } from './types';

export interface TourProps {
  definition: TourDefinition;
  /** The person's first name, used in Meera's lines. */
  name: string;
  /** Phones show the menu in a drawer and the tour as a bottom sheet. */
  isPhone: boolean;
  openMenu: (open: boolean) => void;
  /** Reached the end (Close or the finale's button): stored as completed. */
  onFinish: () => void;
  /** "Skip": leave the tour; stored as skipped. */
  onSkip: () => void;
  /** "Not now": close it for now; stored as dismissed. Both can be restarted from the menu. */
  onNotNow: () => void;
  /** The finale's button (for example "Book your first visit"). */
  onAction: (to: string) => void;
  /** Started again from the menu (not the first-run invitation): the welcome pose is a wave. */
  restarted?: boolean;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Every matching element that is actually on screen (the menu exists twice on phones). */
// eslint-disable-next-line react-refresh/only-export-components
export function findTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

function union(elements: HTMLElement[]): Box {
  const rects = elements.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * The customer tour: Meera, the guide, tells a short story in chapters. Each chapter has her pose,
 * a small photo panel, Meera's picture, a speech bubble and a spotlight on the real control. Progress is a
 * footsteps path. On desktop the card docks at the bottom-left of the page content; on phones it
 * is a bottom sheet. Back, Next, Skip and Not now are always there. Keyboard: Tab stays in the
 * card and Escape closes it; a screen reader hears each chapter in a polite live region.
 * A chapter whose controls are not on screen is skipped.
 */
export function Tour({
  definition,
  name,
  isPhone,
  openMenu,
  onFinish,
  onSkip,
  onNotNow,
  onAction,
  restarted = false,
}: TourProps) {
  const { steps, finale } = definition;
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const direction = useRef<1 | -1>(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const titleId = useId();
  const step = done ? undefined : steps[index];
  const last = index === steps.length - 1;
  const doneRef = useRef(done);
  const closeRef = useRef({ onFinish, onNotNow });
  useEffect(() => {
    doneRef.current = done;
    closeRef.current = { onFinish, onNotNow };
  });
  const openMenuRef = useRef(openMenu);
  useEffect(() => {
    openMenuRef.current = openMenu;
  });

  const finishOrFinale = useCallback(() => {
    if (finale) {
      setDone(true);
      setBox(null);
    } else onFinish();
  }, [finale, onFinish]);

  const go = useCallback(
    (delta: 1 | -1) => {
      direction.current = delta;
      if (done) {
        if (delta === -1) {
          setDone(false);
          setIndex(steps.length - 1);
        }
        return;
      }
      const next = index + delta;
      if (next >= steps.length) finishOrFinale();
      else if (next >= 0) setIndex(next);
    },
    [done, index, steps.length, finishOrFinale],
  );

  // Find the real controls for this chapter (opening the phone menu first), or skip the chapter.
  useEffect(() => {
    if (!step) {
      if (isPhone) openMenuRef.current(false);
      return;
    }
    if (isPhone) openMenuRef.current(Boolean(step.menu));
    let tries = 0;
    let timer = 0;
    let elements: HTMLElement[] = [];
    const measure = () => {
      if (elements.length > 0) setBox(union(elements));
    };
    // The menu collapsing or the page reflowing moves the target without a resize or scroll:
    // watch the target and the sidebar for size changes too.
    const resizer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    const attach = () => {
      if (!resizer) return;
      elements.forEach((el) => resizer.observe(el));
      const side = document.querySelector('aside');
      if (side) resizer.observe(side);
    };
    const look = () => {
      elements = step.targets.map((t) => findTarget(t)).filter((el): el is HTMLElement => !!el);
      if (elements.length > 0) {
        elements[0]?.scrollIntoView?.({ block: 'center' });
        measure();
        attach();
        // The phone drawer pulls focus into itself when it opens: bring it back to the card.
        window.requestAnimationFrame(() => primaryRef.current?.focus());
        return;
      }
      tries += 1;
      if (tries > 12) {
        // Not there: skip this chapter in the direction we were travelling.
        setBox(null);
        if (direction.current === 1) {
          if (last) finishOrFinale();
          else setIndex(index + 1);
        } else if (index > 0) setIndex(index - 1);
        else setIndex(index + 1);
        return;
      }
      timer = window.setTimeout(look, 40);
    };
    setBox(null);
    look();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(timer);
      resizer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
    // The chapter index identifies the step; the rest are stable or read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isPhone, done]);

  // Focus follows the chapter; Tab is kept in the card; Escape closes it. A native listener on
  // the card stops the phone drawer's own Tab/Escape handling from taking over.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [index, done]);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = () =>
      doneRef.current ? closeRef.current.onFinish() : closeRef.current.onNotNow();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const items = Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (items.length === 0) return;
      const first = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (!card.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        first.focus();
      }
    };
    card.addEventListener('keydown', onKey);
    const onDocKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !card.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onDocKey, true);
    return () => {
      card.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onDocKey, true);
      previous?.focus?.();
    };
  }, []);

  // Geometry is measured at run time, so it is written to the elements directly (not inline JSX
  // styles, which the design rules forbid). Wide screens: the card is docked in the corner of the
  // window that is farthest from the highlighted control (never over the sidebar), and a dotted
  // connector runs from the bubble to that control. Screens 640 px wide or less: a full-width
  // bottom sheet with the spotlight only.
  useLayoutEffect(() => {
    const spot = spotRef.current;
    if (spot && box) {
      spot.style.top = `${box.top - 4}px`;
      spot.style.left = `${box.left - 4}px`;
      spot.style.width = `${box.width + 8}px`;
      spot.style.height = `${box.height + 8}px`;
    }
    const card = cardRef.current;
    const sheet = window.innerWidth <= 640;
    if (card) {
      if (sheet) {
        card.style.top = '';
        card.style.left = '';
        card.style.right = '';
        card.style.bottom = '';
      } else {
        const margin = 16;
        const side = document.querySelector('aside')?.getBoundingClientRect();
        const edge = side && side.width > 0 && side.right < window.innerWidth / 2 ? side.right : 0;
        const r = card.getBoundingClientRect();
        const minLeft = edge + margin;
        const maxLeft = Math.max(minLeft, window.innerWidth - r.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - r.height - margin);
        const corners = [
          { left: minLeft, top: maxTop },
          { left: maxLeft, top: maxTop },
          { left: minLeft, top: margin },
          { left: maxLeft, top: margin },
        ];
        let best = corners[0]!;
        if (box) {
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          let far = -1;
          for (const c of corners) {
            const d = Math.hypot(c.left + r.width / 2 - cx, c.top + r.height / 2 - cy);
            if (d > far) {
              far = d;
              best = c;
            }
          }
        }
        card.style.right = 'auto';
        card.style.bottom = 'auto';
        card.style.left = `${best.left}px`;
        card.style.top = `${best.top}px`;
      }
    }
    // The connector: from the nearest edge of the bubble to the nearest edge of the target.
    const line = lineRef.current;
    const dot = dotRef.current;
    const bubble = cardRef.current?.querySelector<HTMLElement>('[data-bubble]');
    const show = !!(line && dot && bubble && box && !sheet);
    if (line && dot) {
      if (!show) {
        line.setAttribute('visibility', 'hidden');
        dot.setAttribute('visibility', 'hidden');
      } else {
        const b = bubble.getBoundingClientRect();
        const bx = Math.min(Math.max(box.left + box.width / 2, b.left), b.right);
        const by = Math.min(Math.max(box.top + box.height / 2, b.top), b.bottom);
        const tx = Math.min(Math.max(bx, box.left), box.left + box.width);
        const ty = Math.min(Math.max(by, box.top), box.top + box.height);
        line.setAttribute('x1', String(bx));
        line.setAttribute('y1', String(by));
        line.setAttribute('x2', String(tx));
        line.setAttribute('y2', String(ty));
        dot.setAttribute('cx', String(tx));
        dot.setAttribute('cy', String(ty));
        line.removeAttribute('visibility');
        dot.removeAttribute('visibility');
      }
    }
  });

  const shown = done ? finale : step;
  if (!shown) return null;
  const speech = speak(shown.speech, name);
  const heading = shown.title;
  /** The welcome chapter uses her wave when the tour is restarted from the menu. */
  const pose =
    restarted && 'restartPose' in shown && shown.restartPose ? shown.restartPose : shown.pose;
  const countText = done ? 'Finished' : `Chapter ${index + 1} of ${steps.length}`;
  const stepKey = done ? 'finale' : (step?.id ?? String(index));

  return createPortal(
    <div data-tour-root>
      <div aria-hidden="true" className="fixed inset-0 z-toast" />
      {box ? (
        <div
          ref={spotRef}
          aria-hidden="true"
          className="tour-spot pointer-events-none fixed z-toast rounded-nested"
        />
      ) : (
        <div aria-hidden="true" className="tour-dim fixed inset-0 z-toast" />
      )}
      <svg
        aria-hidden="true"
        data-tour-connector
        className="pointer-events-none fixed inset-0 z-toast h-full w-full"
      >
        <line
          ref={lineRef}
          visibility="hidden"
          className="tour-connector"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.1 9"
        />
        <circle ref={dotRef} visibility="hidden" r="5" className="tour-connector-end" />
      </svg>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tour-card
        data-chapter={done ? 'finale' : index + 1}
        className="tour-card glass-photo fixed bottom-0 left-0 z-toast flex max-h-[calc(100dvh-32px)] w-[clamp(320px,92vw,520px)] flex-col gap-sm overflow-y-auto p-md max-sm:max-h-[85dvh] max-sm:w-full max-sm:rounded-b-none sm:rounded-card sm:p-lg max-sm:rounded-t-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-md gap-y-xs">
          <p className="tabular text-xs font-semibold text-text-muted">{countText}</p>
          <ProgressPath count={steps.length} current={done ? steps.length : index} />
        </div>
        <div className="flex flex-col items-stretch gap-sm sm:flex-row sm:items-end">
          <div
            data-meera-stage
            className="relative aspect-[4/5] w-[clamp(120px,32%,200px)] flex-none self-center sm:self-end max-sm:w-[clamp(120px,40%,200px)]"
          >
            <Meera pose={pose} className="h-full w-full" />
          </div>
          <SpeechBubble
            stepKey={stepKey}
            title={heading}
            titleId={titleId}
            text={speech}
            instant={reduced}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <div className="flex flex-wrap gap-sm">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={done ? onFinish : onSkip}
            >
              Skip
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={done ? onFinish : onNotNow}
            >
              Not now
            </Button>
          </div>
          <div className="flex flex-wrap gap-sm">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-10"
              disabled={index === 0 && !done}
              onClick={() => go(-1)}
            >
              Back
            </Button>
            {done && finale ? (
              <Button
                ref={primaryRef}
                size="sm"
                className="min-h-10"
                onClick={() => onAction(finale.action.to)}
              >
                {finale.action.label}
              </Button>
            ) : (
              <Button ref={primaryRef} size="sm" className="min-h-10" onClick={() => go(1)}>
                {last ? 'Finish' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {countText}: {heading}. {speech}
      </p>
    </div>,
    document.body,
  );
}
