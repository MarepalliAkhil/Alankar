import { useSyncExternalStore } from 'react';
import { rolesForPath } from '../policy/policy';

/**
 * The intro order of a public page, in ONE tiny store so animations never fight:
 *
 *   splash  the logo splash is up (first public page of a browser session only)
 *   navbar  the logo has landed in the navbar
 *   hero    the page's hero entrance may start (Zenotians reveal, home Reveal)
 *   tour    everything has played; Meera's tour offer may start
 *
 * Components only gate when they START (`whenIntro`, `useIntroReached`); nothing here changes what
 * they do. Without a splash (already seen, staff or customer portal, reduced motion, switched off,
 * automated browser) the store starts at `tour`, so nothing waits.
 */
export type IntroPhase = 'splash' | 'navbar' | 'hero' | 'tour';
export const INTRO_ORDER: readonly IntroPhase[] = ['splash', 'navbar', 'hero', 'tour'];

/** Set to false to switch the splash off everywhere (for demos see docs/BRAND_LOGO.md). */
export const SPLASH_ENABLED = true;
/** sessionStorage: the splash has been shown in this browser session. */
export const SPLASH_SEEN_KEY = 'alankar-splash-seen';
/** localStorage: "off" never shows it on this browser; "force" shows it even to automated
 * browsers (the dedicated Playwright test); "hold" (automated browsers only) also keeps it on
 * screen until it is skipped, so an accessibility scan can read it. */
export const SPLASH_SWITCH_KEY = 'alankar-splash';
/** A hero entrance that never says it finished cannot hold the tour back longer than this. */
export const HERO_MAX_MS = 2500;

const rank = (phase: IntroPhase) => INTRO_ORDER.indexOf(phase);

let seenThisLoad = false; // when storage is blocked: at most once per page load
let phase: IntroPhase = 'tour';
let heroHolds = 0;
let heroTimer = 0;
const listeners = new Set<() => void>();

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Staff and customer areas (anything in the shared policy) never show the splash. */
export function isPortalPath(path: string): boolean {
  return rolesForPath(path).length > 0;
}

/** Whether the splash should play for a first entry on `path`. */
export function shouldPlaySplash(path: string): boolean {
  if (!SPLASH_ENABLED || typeof window === 'undefined') return false;
  const switched = readLocal(SPLASH_SWITCH_KEY);
  if (switched === 'off') return false;
  // Automated browsers (Playwright) skip it unless a test asks for it, so no other test waits.
  const forced = switched === 'force' || switched === 'hold';
  if (typeof navigator !== 'undefined' && navigator.webdriver && !forced) return false;
  if (isPortalPath(path)) return false;
  if (seenThisLoad || readSession(SPLASH_SEEN_KEY)) return false;
  if (prefersReducedMotion()) return false;
  return true;
}

/** Automated browsers only: the splash stays up until skipped (see SPLASH_SWITCH_KEY). */
export function splashHeld(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.webdriver &&
    readLocal(SPLASH_SWITCH_KEY) === 'hold'
  );
}

/** Remember that the splash was shown (storage may fail: then only for this page load). */
export function markSplashSeen(): void {
  seenThisLoad = true;
  try {
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
  } catch {
    // private mode or blocked storage: `seenThisLoad` still stops a second splash
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function heroCheck(): void {
  if (phase !== 'hero' || heroHolds > 0) return;
  window.clearTimeout(heroTimer);
  phase = 'tour';
  emit();
}

/** Moves forward to `to` (never backwards). */
export function advanceIntro(to: IntroPhase): void {
  if (rank(to) <= rank(phase)) return;
  phase = to;
  if (to === 'hero') {
    // Heroes that start now hold this phase synchronously; give them a tick, and a cap.
    window.clearTimeout(heroTimer);
    heroTimer = window.setTimeout(() => {
      heroHolds = 0;
      heroCheck();
    }, HERO_MAX_MS);
    window.setTimeout(heroCheck, 0);
  }
  emit();
}

/** A hero entrance that is playing keeps the tour waiting; call the returned function when done. */
export function holdHero(): () => void {
  if (phase !== 'hero') return () => undefined;
  heroHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    heroHolds = Math.max(0, heroHolds - 1);
    heroCheck();
  };
}

export function getIntroPhase(): IntroPhase {
  return phase;
}

export function introReached(target: IntroPhase): boolean {
  return rank(phase) >= rank(target);
}

export function subscribeIntro(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs `start` now if `target` is reached, otherwise the moment it is (synchronously, before
 * the next paint). Returns a cancel function. */
export function whenIntro(target: IntroPhase, start: () => void): () => void {
  if (introReached(target)) {
    start();
    return () => undefined;
  }
  const off = subscribeIntro(() => {
    if (!introReached(target)) return;
    off();
    start();
  });
  return off;
}

export function useIntroPhase(): IntroPhase {
  return useSyncExternalStore(subscribeIntro, getIntroPhase, getIntroPhase);
}

export function useIntroReached(target: IntroPhase): boolean {
  return rank(useIntroPhase()) >= rank(target);
}

/** Decides once, at start-up, from the address the visitor landed on. */
export function initIntro(path: string = window.location.pathname): IntroPhase {
  window.clearTimeout(heroTimer);
  heroHolds = 0;
  phase = shouldPlaySplash(path) ? 'splash' : 'tour';
  emit();
  return phase;
}

/** For tests: decide again as if the page had just loaded on `path`. */
export function resetIntroForTests(path: string, { forgetSeen = true } = {}): IntroPhase {
  if (forgetSeen) seenThisLoad = false;
  return initIntro(path);
}

if (typeof window !== 'undefined') initIntro();
