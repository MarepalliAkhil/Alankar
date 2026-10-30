import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onFrame(progress, rect)` (0 when the top of `ref` reaches the top of the window, 1 when its
 * end reaches the bottom) at most once per animation frame while the page scrolls or resizes.
 * The callback writes CSS variables directly, so scrolling never re-renders React.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement>,
  onFrame: (progress: number, rect: DOMRect) => void,
  enabled = true,
): void {
  const callback = useRef(onFrame);
  callback.current = onFrame;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      const progress = distance > 0 ? Math.min(1, Math.max(0, -rect.top / distance)) : 0;
      callback.current(progress, rect);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);
}
