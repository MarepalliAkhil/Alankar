import { useEffect, useRef } from 'react';

/** Sets data-scrolled="true" on the element once the page is scrolled past `threshold` px.
 * Writes the attribute directly, so scrolling never re-renders React. */
export function useScrolled<T extends HTMLElement>(threshold = 24) {
  const ref = useRef<T>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      ref.current?.setAttribute('data-scrolled', String(window.scrollY > threshold));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return ref;
}
