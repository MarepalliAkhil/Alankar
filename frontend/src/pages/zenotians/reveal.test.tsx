import { act, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVEAL,
  motionAllowed,
  planReveal,
  replayRequested,
  resetRevealForTests,
  staggerDelay,
  useZenReveal,
} from './reveal';

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let callback: Callback = () => undefined;
const observed = new Set<Element>();
const unobserved: Element[] = [];

class FakeObserver {
  constructor(cb: Callback) {
    callback = cb;
  }
  observe(el: Element) {
    observed.add(el);
  }
  unobserve(el: Element) {
    observed.delete(el);
    unobserved.push(el);
  }
  disconnect() {
    observed.clear();
  }
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function Harness({
  cards = 3,
  links = 3,
  route = '/zenotians',
}: {
  cards?: number;
  links?: number;
  route?: string;
}) {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  useZenReveal(stage, route);
  return (
    <div ref={setStage} className="zen-stage" data-testid="stage">
      <div data-zen-sidebar>
        <nav>
          {Array.from({ length: links }, (_, i) => (
            <a key={i} href={`#${i}`}>
              link {i}
            </a>
          ))}
        </nav>
      </div>
      <div id="zen-content">
        <div>
          <section className="glass">
            <div>
              <p>eyebrow</p>
              <h1>Headline</h1>
              <p>intro</p>
              <button>go</button>
            </div>
          </section>
          <section>
            <h2>Numbers</h2>
            <ul className="grid">
              {Array.from({ length: cards }, (_, i) => (
                <li key={i}>
                  <button>card {i}</button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const delayOf = (el: Element) =>
  Number.parseInt((el as HTMLElement).style.getPropertyValue('--zen-delay'));

beforeEach(() => {
  resetRevealForTests();
  observed.clear();
  unobserved.length = 0;
  window.history.replaceState({}, '', '/zenotians');
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  stubMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('stagger maths', () => {
  it('adds the step per item and never passes the cap', () => {
    expect(staggerDelay(0, 80, 40, 600)).toBe(80);
    expect(staggerDelay(3, 80, 40, 600)).toBe(200);
    expect(staggerDelay(500, 80, 40, 600)).toBe(600);
    expect(staggerDelay(500, REVEAL.blockStart, REVEAL.cardStep, REVEAL.maxDelay)).toBe(1000);
  });

  it('keeps the above-the-fold intro inside about 1.6 seconds', () => {
    expect(REVEAL.maxDelay + REVEAL.duration).toBeLessThanOrEqual(1600);
    expect(REVEAL.heroCap + REVEAL.duration).toBeLessThanOrEqual(1600);
    expect(REVEAL.menuCap + REVEAL.duration).toBeLessThanOrEqual(1600);
  });
});

describe('planReveal', () => {
  it('orders the sidebar, the hero lines and the cards, with capped delays', () => {
    const { container } = render(<Harness cards={40} links={40} />);
    const root = container.querySelector('.zen-stage') as HTMLElement;
    const plan = planReveal(root, true);
    const delays = plan.map((p) => p.delay);
    expect(Math.max(...delays)).toBeLessThanOrEqual(REVEAL.maxDelay);
    const menu = plan.filter((p) => p.el.matches('nav a'));
    expect(menu[1]!.delay - menu[0]!.delay).toBe(REVEAL.menuStep);
    expect(Math.max(...menu.map((m) => m.delay))).toBeLessThanOrEqual(REVEAL.menuCap);
    const cards = plan.filter((p) => p.el.matches('li'));
    expect(cards[1]!.delay - cards[0]!.delay).toBe(REVEAL.cardStep);
    expect(cards).toHaveLength(40);
  });

  it('plays only the short version (no sidebar, no waiting) when it is not the intro', () => {
    const { container } = render(<Harness />);
    const plan = planReveal(container.querySelector('.zen-stage') as HTMLElement, false);
    expect(plan.some((p) => p.el.hasAttribute('data-zen-sidebar'))).toBe(false);
    expect(plan.every((p) => p.delay === 0)).toBe(true);
  });
});

describe('useZenReveal', () => {
  it('hides before the first paint and reveals once when it scrolls into view', () => {
    const { getByTestId } = render(<Harness />);
    const stage = getByTestId('stage');
    expect(stage).toHaveAttribute('data-zen-motion', 'on');
    const card = stage.querySelector('li')!;
    expect(card).toHaveAttribute('data-zen-r');
    expect(card).not.toHaveAttribute('data-revealed');
    act(() => callback([{ target: card, isIntersecting: false }]));
    expect(card).not.toHaveAttribute('data-revealed');
    act(() => callback([{ target: card, isIntersecting: true }]));
    expect(card).toHaveAttribute('data-revealed');
    expect(card).toHaveAttribute('data-revealing'); // will-change only while it runs
    expect(unobserved).toContain(card); // one shared observer, unobserved after the reveal
    fireEvent.animationEnd(card);
    expect(card).not.toHaveAttribute('data-revealing');
    // Scrolling back up never replays it.
    const before = card.getAttribute('style');
    act(() => callback([{ target: card, isIntersecting: true }]));
    expect(card.getAttribute('style')).toBe(before);
  });

  it('uses the stored stagger delay at first and none for what scrolls in later', () => {
    const { getByTestId } = render(<Harness cards={3} />);
    const cards = Array.from(getByTestId('stage').querySelectorAll('li'));
    act(() => callback([{ target: cards[1]!, isIntersecting: true }]));
    expect(delayOf(cards[1]!)).toBe(REVEAL.blockStart + 40 + REVEAL.cardStep);
    const spy = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 5000);
    act(() => callback([{ target: cards[2]!, isIntersecting: true }]));
    expect(delayOf(cards[2]!)).toBe(0);
    spy.mockRestore();
  });

  it('reveals at once when the keyboard reaches an element that is still hidden', () => {
    const { getByTestId } = render(<Harness />);
    const card = getByTestId('stage').querySelectorAll('li')[2]!;
    expect(card).not.toHaveAttribute('data-revealed');
    fireEvent.focusIn(card.querySelector('button')!);
    expect(card).toHaveAttribute('data-revealed');
    expect(card).toHaveAttribute('data-zen-instant');
    expect(delayOf(card)).toBe(0);
  });

  it('plays the full intro on every fresh mount: there is no once-per-session limit', () => {
    for (let visit = 0; visit < 3; visit += 1) {
      const view = render(<Harness />);
      expect(view.getByTestId('stage')).toHaveAttribute('data-zen-speed', 'intro');
      expect(view.getByTestId('stage')).toHaveAttribute('data-reveal', 'playing');
      view.unmount();
      // Deliberately no reset of the module state and no sessionStorage clearing between visits.
    }
    expect(window.sessionStorage.getItem('zen-intro-played')).toBeNull();
  });

  it('still plays the intro under React StrictMode, which runs effects twice in development', () => {
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    expect(view.getByTestId('stage')).toHaveAttribute('data-zen-speed', 'intro');
    const menu = view.getByTestId('stage').querySelectorAll('nav a');
    expect(delayOf(menu[1]!) - delayOf(menu[0]!)).toBe(REVEAL.menuStep);
  });

  it('is not affected by blocked storage (it never reads storage)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('stage')).toHaveAttribute('data-zen-motion', 'on');
    expect(getByTestId('stage')).toHaveAttribute('data-zen-speed', 'intro');
    spy.mockRestore();
  });

  it('plays the short slide-in when the sub-route changes (and not the sidebar again)', () => {
    const view = render(<Harness route="/zenotians" />);
    const stage = view.getByTestId('stage');
    expect(stage).toHaveAttribute('data-zen-speed', 'intro');
    const card = stage.querySelector('li')!;
    act(() => callback([{ target: card, isIntersecting: true }]));
    expect(card).toHaveAttribute('data-revealed');
    view.rerender(<Harness route="/zenotians/project" />);
    expect(stage).toHaveAttribute('data-zen-speed', 'short');
    expect(stage).toHaveAttribute('data-reveal', 'playing');
    expect(card).not.toHaveAttribute('data-revealed'); // reset, so it slides in again
    expect(stage.querySelector('[data-zen-sidebar]')).not.toHaveAttribute('data-zen-r');
    expect(delayOf(card)).toBe(0);
  });

  it('?replay forces the full intro again, also on a sub-route change', () => {
    expect(replayRequested('?replay')).toBe(true);
    expect(replayRequested('?a=1&replay')).toBe(true);
    expect(replayRequested('?replay=1')).toBe(true);
    expect(replayRequested('?replayed=1')).toBe(false);
    expect(replayRequested('')).toBe(false);
    const view = render(<Harness route="/zenotians" />);
    const stage = view.getByTestId('stage');
    view.rerender(<Harness route="/zenotians/day" />);
    expect(stage).toHaveAttribute('data-zen-speed', 'short');
    window.history.replaceState({}, '', '/zenotians/project?replay');
    view.rerender(<Harness route="/zenotians/project" />);
    expect(stage).toHaveAttribute('data-zen-speed', 'intro');
  });

  it('sets data-reveal to playing, then done once the intro has finished', () => {
    vi.useFakeTimers();
    const { getByTestId } = render(<Harness cards={6} />);
    const stage = getByTestId('stage');
    expect(stage).toHaveAttribute('data-reveal', 'playing');
    act(() => {
      vi.advanceTimersByTime(REVEAL.maxDelay + REVEAL.duration + 200);
    });
    expect(stage).toHaveAttribute('data-reveal', 'done');
    vi.useRealTimers();
  });

  it('keeps the stagger inside the cap whatever the number of cards', () => {
    const { container } = render(<Harness cards={200} links={60} />);
    const plan = planReveal(container.querySelector('.zen-stage') as HTMLElement, true);
    expect(Math.max(...plan.map((p) => p.delay))).toBeLessThanOrEqual(REVEAL.maxDelay);
    expect(REVEAL.cardStep).toBeGreaterThanOrEqual(60);
    expect(REVEAL.cardStep).toBeLessThanOrEqual(70);
    expect(REVEAL.maxDelay + REVEAL.duration).toBeLessThanOrEqual(1600);
  });

  it('shows everything at once with reduced motion', () => {
    stubMotion(true);
    const { getByTestId } = render(<Harness />);
    const stage = getByTestId('stage');
    expect(stage).toHaveAttribute('data-zen-motion', 'off');
    expect(stage).toHaveAttribute('data-reveal', 'reduced');
    expect(stage.querySelector('[data-zen-r]')).toBeNull();
    expect(motionAllowed()).toBe(false);
  });

  it('shows everything when there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('stage')).toHaveAttribute('data-zen-motion', 'off');
    expect(getByTestId('stage').querySelector('[data-zen-r]')).toBeNull();
  });

  it('never uses aria-hidden for the animation and keeps the focus order', () => {
    const { getByTestId } = render(<Harness />);
    const stage = getByTestId('stage');
    expect(stage.querySelector('[data-zen-r][aria-hidden]')).toBeNull();
    expect(stage.querySelector('[data-zen-r][tabindex]')).toBeNull();
  });
});

describe('the entrance CSS', () => {
  const css = readFileSync(join(process.cwd(), 'src/design/index.css'), 'utf8');
  // Only the entrance section: it ends where the division hero section begins.
  const start = css.indexOf('For Zenotians entrance');
  const block = css.slice(start, css.indexOf('division hero (Salon, Spa, Parlor)', start));

  it('hides nothing unless JavaScript switched the stage on', () => {
    const hiding = block
      .split('}')
      .filter((rule) => /opacity:\s*0\b/.test(rule) && !/\bfrom\s*\{/.test(rule));
    expect(hiding.length).toBeGreaterThan(0);
    for (const rule of hiding) expect(rule).toContain("[data-zen-motion='on']");
  });

  it('animates only transform and opacity, with no blur', () => {
    const keyframes = block.match(/@keyframes zen-[a-z]+ \{[\s\S]*?\n\}/g) ?? [];
    expect(keyframes.length).toBe(2);
    for (const frames of keyframes) {
      const props = Array.from(frames.matchAll(/^\s+([a-z-]+):/gm)).map((m) => m[1]);
      expect(props.filter((p) => !['opacity', 'transform'].includes(p!))).toEqual([]);
    }
    expect(block).not.toMatch(/filter|blur\(/);
  });

  it('uses 24 px on desktop and 12 px on phones, and clips on the stage only', () => {
    expect(block).toMatch(/--zen-x: -24px/);
    expect(block).toMatch(/@media \(max-width: 640px\)[\s\S]*--zen-x: -12px/);
    expect(block).toMatch(/\.zen-stage \{\s*overflow-x: clip/);
  });

  it('shows everything with reduced motion and in print', () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\), print/);
    expect(block).toMatch(/animation: none !important/);
  });
});
