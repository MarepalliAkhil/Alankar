import { useCallback, useEffect, useState } from 'react';
import type { HomeChapter } from '../design/art';

/** Where each of the four sections starts: the section id and its short label. */
export const HOME_SECTIONS = [
  { chapter: 1, id: 'home-alankar', label: 'Alankar' },
  { chapter: 2, id: 'home-salon', label: 'Salon' },
  { chapter: 3, id: 'home-spa', label: 'Spa' },
  { chapter: 4, id: 'home-parlor', label: 'Parlor' },
] as const satisfies readonly { chapter: HomeChapter; id: string; label: string }[];

/**
 * Which of the four sections is mostly in view. Sections mark themselves with
 * `data-home-chapter="1..4"`; one light IntersectionObserver watches them (no scroll listener, no
 * layout work) and the section crossing the middle of the screen wins. Without
 * IntersectionObserver the first section stays.
 */
export function useHomeChapter(): HomeChapter {
  const [chapter, setChapter] = useState<HomeChapter>(1);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const watched = new WeakSet<Element>();
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const value = Number((entry.target as HTMLElement).dataset.homeChapter);
          if (value >= 1 && value <= 4) setChapter(value as HomeChapter);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    // The sections may be drawn after the page content arrives from the server (slow network or
    // machine), so new ones are picked up as they appear instead of only once at the start.
    const scan = () => {
      document.querySelectorAll('[data-home-chapter]').forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        seen.observe(el);
      });
    };
    scan();
    let frame = 0;
    const added =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
              frame = 0;
              scan();
            });
          });
    added?.observe(document.body, { childList: true, subtree: true });
    return () => {
      added?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, []);
  return chapter;
}

/** Scrolls a section into view (the side indicator's click and keyboard jump). */
export function useJumpToSection() {
  return useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }, []);
}
