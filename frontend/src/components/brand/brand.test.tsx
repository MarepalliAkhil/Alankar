import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand } from '../../config/brand';
import { LOGO_HOME, logoHomeFor } from '../../config/logoHome';
import { routerFuture } from '../../config/router';
import {
  advanceIntro,
  getIntroPhase,
  holdHero,
  resetIntroForTests,
  shouldPlaySplash,
  SPLASH_SEEN_KEY,
  SPLASH_SWITCH_KEY,
  subscribeIntro,
  type IntroPhase,
} from '../../intro/introPhase';
import { homeFor, type Role } from '../../policy/policy';
import { SessionContext, type SessionValue } from '../../session/session-context';
import { userFor } from '../../test/session';
import { BrandLink } from './BrandLink';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { LoaderSlot, LogoLoader } from './LogoLoader';
import { Splash, SPLASH } from './Splash';

function media(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

function session(role: Role | null): SessionValue {
  return {
    status: role ? 'authenticated' : 'anonymous',
    user: role ? userFor(role) : null,
    signIn: vi.fn(),
    completeOtp: vi.fn(),
    completeTwoFactor: vi.fn(),
    signOut: vi.fn(),
  } as unknown as SessionValue;
}

function renderPublic(role: Role | null = null) {
  return render(
    <SessionContext.Provider value={session(role)}>
      <MemoryRouter future={routerFuture}>
        <nav aria-label="Main">
          <BrandLink placement="navbar" />
        </nav>
        <Splash />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

/** A fresh browser session landing on `path`. */
function freshSession(path = '/') {
  window.sessionStorage.removeItem(SPLASH_SEEN_KEY);
  return resetIntroForTests(path);
}

beforeEach(() => {
  media(false);
  window.localStorage.removeItem(SPLASH_SWITCH_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
  resetIntroForTests('/', { forgetSeen: true });
});

describe('the logo splash', () => {
  it('plays on the first public page of a session, and not again', () => {
    expect(freshSession('/')).toBe('splash');
    renderPublic();
    expect(screen.getByTestId('splash')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SPLASH_SEEN_KEY)).toBe('1');
    // A later navigation or reload in the same session: no splash.
    expect(resetIntroForTests('/salon', { forgetSeen: false })).toBe('tour');
  });

  it('plays on any public landing page, never on the staff or customer portals', () => {
    for (const path of ['/', '/login', '/register', '/salon', '/spa', '/zenotians', '/privacy']) {
      window.sessionStorage.removeItem(SPLASH_SEEN_KEY);
      resetIntroForTests(path);
      expect(shouldPlaySplash(path), path).toBe(true);
    }
    for (const role of ['admin', 'receptionist', 'stylist', 'customer'] as const) {
      expect(shouldPlaySplash(homeFor(role)), role).toBe(false);
    }
  });

  it('shows it once per page load at most when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(resetIntroForTests('/')).toBe('splash');
    renderPublic();
    expect(resetIntroForTests('/', { forgetSeen: false })).toBe('tour');
    vi.restoreAllMocks();
  });

  it('can be switched off for demos', () => {
    window.localStorage.setItem(SPLASH_SWITCH_KEY, 'off');
    expect(freshSession('/')).toBe('tour');
  });

  it.each([
    ['a click anywhere', () => fireEvent.click(screen.getByTestId('splash'))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['the Skip button', () => fireEvent.click(screen.getByRole('button', { name: 'Skip' }))],
  ])('is skipped by %s', (_how, skip) => {
    freshSession('/');
    renderPublic();
    expect(document.getElementById('root') ?? document.body).toBeTruthy();
    act(() => skip());
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(['hero', 'tour']).toContain(getIntroPhase());
  });

  it('has a keyboard-focusable Skip control and only a polite welcome', () => {
    freshSession('/');
    renderPublic();
    const skip = screen.getByRole('button', { name: 'Skip' });
    skip.focus();
    expect(document.activeElement).toBe(skip);
    expect(screen.getByRole('status')).toHaveTextContent(`Welcome to ${brand.shopName}`);
  });

  it('ends by itself within the cap', () => {
    vi.useFakeTimers();
    freshSession('/');
    renderPublic();
    act(() => {
      vi.advanceTimersByTime(SPLASH.cap);
    });
    expect(screen.queryByTestId('splash')).toBeNull();
  });

  it('ends at once when the window is resized or turned', () => {
    freshSession('/');
    renderPublic();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByTestId('splash')).toBeNull();
  });

  it('never animates with reduced motion: the logo is simply in the navbar', () => {
    media(true);
    expect(freshSession('/')).toBe('tour');
    renderPublic();
    expect(screen.queryByTestId('splash')).toBeNull();
    const link = screen.getByRole('link', { name: `${brand.logoText} home` });
    expect(link).toHaveAttribute('data-intro', 'shown');
  });

  it('keeps the navbar logo in its reserved place while the splash is up', () => {
    freshSession('/');
    renderPublic();
    const link = screen.getByRole('link', { name: `${brand.logoText} home` });
    expect(link).toHaveAttribute('data-intro', 'splash');
    expect(link.querySelector('[data-brand-mark="navbar"]')).not.toBeNull();
  });
});

describe('the intro phases', () => {
  it('run splash, navbar, hero, then tour, and the tour waits for the hero entrance', () => {
    vi.useFakeTimers();
    freshSession('/');
    const seen: IntroPhase[] = [getIntroPhase()];
    const off = subscribeIntro(() => seen.push(getIntroPhase()));
    advanceIntro('navbar');
    advanceIntro('hero');
    const release = holdHero(); // a hero entrance starts
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(getIntroPhase()).toBe('hero');
    release();
    expect(getIntroPhase()).toBe('tour');
    expect(seen).toEqual(['splash', 'navbar', 'hero', 'tour']);
    off();
  });

  it('never moves backwards', () => {
    freshSession('/');
    advanceIntro('hero');
    advanceIntro('splash');
    expect(getIntroPhase()).toBe('hero');
  });

  it('advances at once when the splash is skipped, already seen or not wanted', () => {
    expect(resetIntroForTests('/', { forgetSeen: false })).toBe('tour'); // already seen
    media(true);
    expect(freshSession('/')).toBe('tour'); // reduced motion
    media(false);
    expect(freshSession(homeFor('receptionist'))).toBe('tour'); // staff portal
  });

  it('does not let a hero that never finishes hold the tour back forever', () => {
    vi.useFakeTimers();
    freshSession('/');
    advanceIntro('hero');
    holdHero();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(getIntroPhase()).toBe('tour');
  });
});

describe('the logo home button', () => {
  it('goes home for visitors and customers and to the dashboard for staff', () => {
    expect(logoHomeFor(null)).toBe(LOGO_HOME.visitor);
    expect(logoHomeFor(userFor('customer'))).toBe('/');
    for (const role of ['admin', 'receptionist', 'stylist'] as const) {
      expect(logoHomeFor(userFor(role))).toBe(homeFor(role));
    }
    for (const role of [null, 'customer', 'receptionist'] as const) {
      const { unmount } = renderPublic(role);
      const link = screen.getByRole('link', { name: `${brand.logoText} home` });
      expect(link).toHaveAttribute('href', role === 'receptionist' ? homeFor(role) : '/');
      unmount();
    }
  });

  it('has an accessible name that starts with the visible text', () => {
    renderPublic();
    const link = screen.getByRole('link', { name: `${brand.logoText} home` });
    const visible = Array.from(link.querySelectorAll('.brand-word'))
      .map((el) => el.firstChild?.textContent ?? '')
      .join('')
      .trim();
    expect(visible).toBe(brand.logoText);
    expect(`${brand.logoText} home`.startsWith(visible)).toBe(true);
  });

  it('is labelled when the sidebar is collapsed and shows no text', () => {
    render(
      <SessionContext.Provider value={session('stylist')}>
        <MemoryRouter future={routerFuture}>
          <BrandLink placement="sidebar" collapsed />
        </MemoryRouter>
      </SessionContext.Provider>,
    );
    expect(screen.getByRole('link', { name: `${brand.logoText} home` })).toHaveAttribute(
      'href',
      homeFor('stylist'),
    );
  });
});

function Probe({ loading }: { loading: boolean }) {
  const visible = useDelayedLoading(loading);
  return <LoaderSlot visible={visible} />;
}

describe('the logo loader', () => {
  it('is a polite status with a label', () => {
    render(<LogoLoader size="medium" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('never shows for a fast load', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe loading />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    rerender(<Probe loading={false} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears after 300 ms and then stays at least 500 ms', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe loading />);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender(<Probe loading={false} />); // loaded 50 ms after it appeared
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('status')).toBeInTheDocument(); // still within the 500 ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps its slot the same size whether or not it shows (no layout shift)', () => {
    const { container, rerender } = render(<LoaderSlot visible={false} />);
    const slot = container.querySelector('[data-loader-slot]')!;
    expect(slot.className).toContain('h-5 w-5');
    rerender(<LoaderSlot visible />);
    expect(container.querySelector('[data-loader-slot]')!.className).toContain('h-5 w-5');
  });
});
