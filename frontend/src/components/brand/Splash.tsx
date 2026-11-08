import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { brand } from '../../config/brand';
import { advanceIntro, markSplashSeen, useIntroPhase } from '../../intro/introPhase';
import { LogoFillPaths, LogoOutlinePaths } from './AlankarLogo';
import { LOGO_VIEWBOX } from './alankar-logo-paths';
import './brand.css';

/** Splash timing in milliseconds (about 2 s in total, never more than `cap`). */
export const SPLASH = { draw: 900, fill: 400, glide: 600, cap: 3000 } as const;

type Step = 'draw' | 'fill' | 'glide';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The page is ready to be seen: fonts loaded and the hero picture decoded (never awaited past
 * the cap by the caller). */
async function pageReady(): Promise<void> {
  await new Promise<void>((resolve) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => resolve())
      : resolve(),
  );
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  const hero =
    document.querySelector<HTMLImageElement>('main img[fetchpriority="high"]') ??
    document.querySelector<HTMLImageElement>('main img');
  await Promise.all([
    fonts?.ready.catch(() => undefined),
    hero && typeof hero.decode === 'function' ? hero.decode().catch(() => undefined) : undefined,
  ]);
}

/**
 * The logo splash: on the first public page of a browser session the A draws as an outline, fills
 * in, then glides to its place in the navbar while the wordmark slides out. The real page renders
 * underneath the whole time (inert while covered). Click, tap, Escape or Skip ends it at once;
 * resizing or turning the phone ends it too. It never runs on the staff or customer portals and
 * never with reduced motion (see `intro/introPhase.ts`).
 */
export function Splash() {
  const phase = useIntroPhase();
  if (phase !== 'splash' || typeof document === 'undefined') return null;
  return createPortal(<SplashOverlay />, document.body);
}

function SplashOverlay() {
  const [step, setStep] = useState<Step>('draw');
  const logo = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGGElement>(null);
  const ended = useRef(false);

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    advanceIntro('navbar');
    advanceIntro('hero');
  }, []);

  // While the overlay is up the page underneath is hidden from assistive tech and the keyboard.
  useLayoutEffect(() => {
    markSplashSeen();
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
    };
  }, []);

  // Measure every outline path and start the line drawing on the next frame.
  useLayoutEffect(() => {
    const paths = Array.from(outline.current?.querySelectorAll('path') ?? []);
    for (const path of paths) {
      let length = 2000;
      try {
        length = path.getTotalLength?.() || length;
      } catch {
        // not measurable (no layout engine): keep the safe default
      }
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        for (const path of paths) path.style.strokeDashoffset = '0';
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    timers.push(window.setTimeout(finish, SPLASH.cap));
    timers.push(window.setTimeout(() => setStep('fill'), SPLASH.draw));

    const glide = () => {
      if (cancelled || ended.current) return;
      const target = document.querySelector('[data-brand-mark="navbar"]');
      const box = logo.current;
      if (!target || !box) return finish();
      const from = box.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      if (!from.width || !to.width) return finish();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      box.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
      setStep('glide');
      timers.push(window.setTimeout(finish, SPLASH.glide));
    };
    // The glide starts once the logo has filled AND the page is ready, but never so late that
    // the whole splash would pass the cap.
    void Promise.all([
      wait(SPLASH.draw + SPLASH.fill),
      Promise.race([pageReady(), wait(SPLASH.cap - SPLASH.glide - 100)]),
    ]).then(glide);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', finish);
    window.addEventListener('orientationchange', finish);
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', finish);
      window.removeEventListener('orientationchange', finish);
    };
  }, [finish]);

  return (
    <div className="splash" data-step={step} data-testid="splash" onClick={finish}>
      <div className="splash-bg bg-background" />
      <p role="status" className="sr-only">
        Welcome to {brand.shopName}
      </p>
      <div ref={logo} className="splash-logo text-primary-hover">
        <svg viewBox={LOGO_VIEWBOX} aria-hidden="true" focusable="false">
          <g ref={outline} className="splash-outline">
            <LogoOutlinePaths />
          </g>
          <g className="splash-fill" fill="currentColor">
            <LogoFillPaths />
          </g>
        </svg>
      </div>
      <button
        type="button"
        onClick={finish}
        className="splash-skip inline-flex min-h-11 items-center rounded-full bg-surface px-md text-sm font-semibold text-text shadow-raised focus-visible:shadow-focus focus-visible:outline-none"
      >
        Skip
      </button>
    </div>
  );
}
