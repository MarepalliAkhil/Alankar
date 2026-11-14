import { useLayoutEffect, useRef } from 'react';
import { holdHero, whenIntro } from '../../intro/introPhase';

/**
 * The For Zenotians entrance animation: the page assembles on an empty screen, sliding in from
 * the left. ONE switch turns the whole thing off; with it off (or with reduced motion, or without
 * IntersectionObserver, or without JavaScript) everything is simply visible.
 *
 * The full intro plays on EVERY fresh mount of the page (a reload, a fresh visit, coming back from
 * another page), with no once-per-session limit. Moving between sub-routes inside the page plays the
 * short slide-in. Adding ?replay to the address plays the full intro again. The stage carries
 * data-reveal="playing" | "done" | "reduced" so the state can be read in DevTools.
 */
export const ZEN_REVEAL_ENABLED = true;

/** Timing in milliseconds. The above-the-fold intro ends by about 1.6 s (delay + duration). */
export const REVEAL = {
  duration: 550,
  shortDuration: 300,
  menuStart: 80,
  menuStep: 60,
  menuCap: 600,
  heroFrame: 150,
  heroStart: 240,
  heroStep: 70,
  heroCap: 700,
  blockStart: 520,
  cardStep: 70,
  /** No element waits longer than this, however long the page is. */
  maxDelay: 1000,
  /** Reveals after this long (scrolling) never wait. Generous, so a slow first load still plays. */
  initialWindow: 1500,
} as const;

/** delay = base + index * step, never more than `cap`. */
export function staggerDelay(index: number, base: number, step: number, cap: number): number {
  return Math.min(Math.max(0, base + index * step), cap);
}

export function motionAllowed(): boolean {
  if (!ZEN_REVEAL_ENABLED) return false;
  if (typeof IntersectionObserver === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when the system asks for reduced motion. */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** True when the address has ?replay, which forces the full intro (for testing). */
export function replayRequested(search: string = window.location.search): boolean {
  return /(^|[?&])replay(=|&|$)/.test(search);
}

export type RevealState = 'playing' | 'done' | 'reduced';

// ------------------------------------------------------------------ one shared observer

const replanners = new WeakMap<HTMLElement, () => void>();
let observer: IntersectionObserver | null = null;
const pending = new Map<Element, { delay: number }>();
let windowStart = 0;

function ensureObserver(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const info = pending.get(entry.target);
        observer?.unobserve(entry.target); // once only: never replays on scroll back up
        pending.delete(entry.target);
        const late = performance.now() - windowStart > REVEAL.initialWindow;
        reveal(entry.target as HTMLElement, late ? 0 : (info?.delay ?? 0));
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  return observer;
}

/** Starts the slide: transform and opacity only; will-change exists only while it runs. */
export function reveal(el: HTMLElement, delay: number, instant = false): void {
  if (el.hasAttribute('data-revealed')) return;
  pending.delete(el);
  observer?.unobserve(el);
  el.style.setProperty('--zen-delay', `${instant ? 0 : delay}ms`);
  if (instant) el.setAttribute('data-zen-instant', '');
  else {
    el.setAttribute('data-revealing', '');
    const done = () => el.removeAttribute('data-revealing');
    el.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, delay + REVEAL.duration + 400); // in case no animation ever runs
  }
  el.setAttribute('data-revealed', '');
}

function watch(el: HTMLElement, delay: number): void {
  if (!el.hasAttribute('data-zen-r')) el.setAttribute('data-zen-r', '');
  el.removeAttribute('data-revealed');
  el.removeAttribute('data-zen-instant');
  el.style.setProperty('--zen-delay', `${delay}ms`);
  pending.set(el, { delay });
  ensureObserver()?.observe(el);
}

export interface Plan {
  el: HTMLElement;
  delay: number;
}

/** What animates, in order. Pure DOM reading, so tests can check it without a browser. */
export function planReveal(root: HTMLElement, intro: boolean): Plan[] {
  const plan: Plan[] = [];
  const push = (el: Element | null | undefined, delay: number) => {
    if (el instanceof HTMLElement && !plan.some((p) => p.el === el)) plan.push({ el, delay });
  };
  const at = (i: number, base: number, step: number, cap: number) =>
    intro ? staggerDelay(i, base, step, cap) : 0;

  if (intro) {
    const sidebar = root.querySelector('[data-zen-sidebar]');
    push(sidebar, 0);
    const items = sidebar?.querySelectorAll('nav a, nav button') ?? [];
    items.forEach((el, i) =>
      push(el, staggerDelay(i, REVEAL.menuStart, REVEAL.menuStep, REVEAL.menuCap)),
    );
  }
  // For Zenotians is one long page: the first section's own content plays the intro (the other
  // sections reveal their blocks as they scroll in).
  const first = root.querySelector('#zen-content')?.firstElementChild;
  const page = first?.hasAttribute('data-zen-section') ? first.firstElementChild : first;
  if (!page) return plan;
  let blocks = 0;
  let cards = 0;
  Array.from(page.children).forEach((child, i) => {
    if (i === 0 && child.querySelector('h1')) {
      push(child, intro ? REVEAL.heroFrame : 0);
      const inner =
        child.matches('header') || !child.querySelector(':scope > div')
          ? child
          : child.querySelector(':scope > div')!;
      Array.from(inner.children).forEach((part, k) =>
        push(part, at(k, REVEAL.heroStart, REVEAL.heroStep, REVEAL.heroCap)),
      );
      return;
    }
    push(child, at(blocks++, REVEAL.blockStart, REVEAL.cardStep, REVEAL.maxDelay));
    child.querySelectorAll(':scope ul.grid > li').forEach((li) => {
      push(li, at(cards++, REVEAL.blockStart + 40, REVEAL.cardStep, REVEAL.maxDelay));
    });
  });
  // The headline and its accent line are hidden by CSS until revealed, so they must always be in
  // the plan, wherever they sit (otherwise the H1 stays invisible and leaves an empty gap).
  root
    .querySelectorAll("[data-zen-r='words'], [data-zen-r='line']")
    .forEach((el) => push(el, intro ? REVEAL.heroStart : 0));
  return plan;
}

/** Reveals what the keyboard reaches, at once, so Tab never lands on something invisible. */
function onFocusIn(event: FocusEvent): void {
  let node = (event.target as Element | null)?.closest('[data-zen-r]:not([data-revealed])');
  while (node) {
    reveal(node as HTMLElement, 0, true);
    node = node.parentElement?.closest('[data-zen-r]:not([data-revealed])') ?? null;
  }
}

/**
 * Runs the entrance on `root` (the sidebar and the section) and again, shorter, whenever a new
 * section appears in #zen-content (a route change, or a lazy page arriving). The attributes are
 * set before the browser paints (layout effect, and a MutationObserver whose callback runs before
 * the next paint), so the first paint is never "content, then hidden, then animated".
 *
 * The first plan after a mount is the full intro, always (no session memory). React's StrictMode
 * runs this effect twice in development: each run starts from its own "first" state, so the second
 * run plays the intro again instead of being treated as a later visit.
 */
export function useZenReveal(el: HTMLElement | null, routeKey = ''): void {
  const lastKey = useRef(routeKey);
  // A move to another sub-route plays the short slide-in, even when the page element is reused.
  useLayoutEffect(() => {
    if (lastKey.current === routeKey) return;
    lastKey.current = routeKey;
    if (el) replanners.get(el)?.();
  }, [el, routeKey]);
  useLayoutEffect(() => {
    if (!el) return;
    if (!motionAllowed()) {
      el.setAttribute('data-zen-motion', 'off');
      el.setAttribute('data-reveal', 'reduced' satisfies RevealState);
      return;
    }
    el.setAttribute('data-zen-motion', 'on');
    const content = el.querySelector('#zen-content');
    const planned = new WeakSet<Element>();
    let mine: Plan[] = [];
    let first = true;
    let doneTimer = 0;
    let release: () => void = () => undefined;
    const run = () => {
      const page = content?.firstElementChild;
      if (!page || planned.has(page)) return;
      // A page that is still loading shows a busy placeholder: wait for the real one, so the
      // intro is not spent on the placeholder.
      if (page.querySelector('[aria-busy="true"]') || page.getAttribute('aria-busy') === 'true')
        return;
      planned.add(page);
      for (const item of mine) {
        pending.delete(item.el);
        observer?.unobserve(item.el);
      }
      const intro = first || replayRequested();
      first = false;
      el.setAttribute('data-zen-speed', intro ? 'intro' : 'short');
      windowStart = performance.now();
      mine = planReveal(el, intro);
      for (const item of mine) watch(item.el, item.delay);
      el.setAttribute('data-reveal', 'playing' satisfies RevealState);
      window.clearTimeout(doneTimer);
      const longest = mine.reduce((most, item) => Math.max(most, item.delay), 0);
      release();
      release = holdHero(); // Meera's tour waits for the hero entrance (intro/introPhase.ts)
      doneTimer = window.setTimeout(
        () => {
          el.setAttribute('data-reveal', 'done' satisfies RevealState);
          release();
        },
        longest + (intro ? REVEAL.duration : REVEAL.shortDuration) + 100,
      );
    };
    replanners.set(el, () => {
      const page = content?.firstElementChild;
      if (page) planned.delete(page);
      run();
    });
    // The entrance starts only after the logo splash has finished (at once when there is none).
    let mutations: MutationObserver | null = null;
    const stopWaiting = whenIntro('hero', () => {
      run();
      mutations = content ? new MutationObserver(run) : null;
      // subtree: a lazy section arriving inside its <section> also counts.
      if (content) mutations?.observe(content, { childList: true, subtree: true });
    });
    el.addEventListener('focusin', onFocusIn);
    return () => {
      stopWaiting();
      release();
      replanners.delete(el);
      window.clearTimeout(doneTimer);
      (mutations as MutationObserver | null)?.disconnect();
      el.removeEventListener('focusin', onFocusIn);
      for (const item of mine) {
        pending.delete(item.el);
        observer?.unobserve(item.el);
      }
    };
  }, [el]);
}

/** For tests: forget the module's state. */
export function resetRevealForTests(): void {
  observer?.disconnect();
  observer = null;
  pending.clear();
}
