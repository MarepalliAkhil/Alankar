import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as airDesk from '../../api/airDesk';
import type { AirBriefing } from '../../api/airDesk';
import { routerFuture } from '../../config/router';
import type { Role } from '../../policy/policy';
import { SessionContext } from '../../session/session-context';
import { userFor } from '../../test/session';
import { AirCharacter, AirPopup } from './Air';
import { AIR_ALT, AIR_POSES, muteKey, shownKey } from './air-data';
import { resetIntroForTests, SPLASH_SEEN_KEY } from '../../intro/introPhase';

const manifest = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock('virtual:photo-manifest', () => ({
  get default() {
    return manifest.files;
  },
}));
vi.mock('../../api/airDesk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/airDesk')>()),
  getAirBriefing: vi.fn(),
}));
const getBriefing = vi.mocked(airDesk.getAirBriefing);

const ALL_POSES = Object.values(AIR_POSES).flatMap((slot) => [
  `air/${slot}.webp`,
  `air/${slot}-512.webp`,
]);

function briefing(over: Partial<AirBriefing> = {}): AirBriefing {
  return {
    since: '2026-11-08T03:30:00+00:00',
    numbers: { conversations: 4, booking_requests: 3, links_paid: 1, needs_you: 2 },
    text: 'Since your last session AIR had 4 conversations and took 3 booking requests. 2 items need you now.',
    template_text: '',
    wording_by_ai: false,
    did_nothing: false,
    mood: 'attention',
    ...over,
  };
}

function media({ reduce = true, phone = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (reduce && query.includes('prefers-reduced-motion')) ||
      (phone && query.includes('max-width: 640px')),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

/** A fake speech engine. `starts` decides whether the browser lets speech begin by itself. */
function speech({ starts }: { starts: boolean }) {
  const spoken: string[] = [];
  const synth = {
    speaking: false,
    speak: vi.fn((u: { text: string; onstart?: () => void }) => {
      spoken.push(u.text);
      if (starts) u.onstart?.();
    }),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  class Utterance {
    text: string;
    lang = '';
    rate = 1;
    onstart?: () => void;
    onend?: () => void;
    onerror?: () => void;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  return { synth, spoken };
}

function mount(role: Role = 'receptionist') {
  const user = userFor(role);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider
        value={{
          status: 'authenticated',
          user,
          signIn: vi.fn(),
          completeOtp: vi.fn(),
          completeTwoFactor: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter future={routerFuture}>
          <button type="button">Somewhere on the page</button>
          <AirPopup />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, user };
}

beforeEach(() => {
  manifest.files = [...ALL_POSES];
  window.localStorage.clear();
  media();
  speech({ starts: true });
  getBriefing.mockResolvedValue(briefing());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AirPopup', () => {
  it('opens by itself once per login session with the full text visible', async () => {
    const { unmount, user } = mount();
    const dialog = await screen.findByRole('dialog', { name: 'While you were away' });
    expect(within(dialog).getAllByText(/took 3 booking requests/).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(shownKey(user.id))).toBe(briefing().since);
    unmount();
    mount();
    await waitFor(() => expect(getBriefing).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull(); // same session: not again by itself
    expect(screen.getByRole('button', { name: /Open AIR/ })).toBeTruthy();
  });

  it('opens again after a new sign-in (a new "since")', async () => {
    const { unmount } = mount();
    await screen.findByRole('dialog');
    unmount();
    getBriefing.mockResolvedValue(briefing({ since: '2026-11-09T03:30:00+00:00' }));
    mount();
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('is never held back by the logo splash (which only runs on public pages)', async () => {
    window.sessionStorage.removeItem(SPLASH_SEEN_KEY);
    resetIntroForTests('/'); // the session started on a public page with the splash
    mount();
    expect(await screen.findByRole('dialog', { name: 'While you were away' })).toBeTruthy();
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    resetIntroForTests('/');
  });

  it('is only for receptionists', async () => {
    for (const role of ['admin', 'customer', 'stylist'] as const) {
      const { unmount } = mount(role);
      await act(async () => undefined);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: /Open AIR/ })).toBeNull();
      unmount();
    }
  });

  it('closes with Escape, gives focus back, and reopens from the AIR button', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Open AIR/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('keeps Tab inside while open but never blocks the page behind it', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(document.querySelector('.tour-dim')).toBeNull(); // no backdrop
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('reads the briefing aloud by itself unless muted, and remembers mute per user', async () => {
    const { synth, spoken } = speech({ starts: true });
    const user = userEvent.setup();
    const view = mount();
    await screen.findByRole('dialog');
    await waitFor(() => expect(synth.speak).toHaveBeenCalled());
    expect(spoken[0]).toBe(briefing().text);
    await user.click(screen.getByRole('button', { name: /Mute/ }));
    expect(window.localStorage.getItem(muteKey(view.user.id))).toBe('1');
    view.unmount();
    synth.speak.mockClear();
    getBriefing.mockResolvedValue(briefing({ since: 'next-session' }));
    mount();
    await screen.findByRole('dialog');
    await act(async () => undefined);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Unmute/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('shows Play when the browser blocks speaking by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { synth } = speech({ starts: false });
    mount();
    await screen.findByRole('dialog');
    // first let the text finish and speech be tried, then let the start timeout pass
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(await screen.findByText(/did not allow reading aloud/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(synth.speak).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('has no Play or mute when the browser cannot speak, and the text still shows', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    // @ts-expect-error -- remove the API for this test
    delete window.speechSynthesis;
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Read aloud' })).toBeNull();
    expect(within(dialog).getAllByText(/took 3 booking requests/).length).toBeGreaterThan(0);
  });

  it('with reduced motion shows the text at once and has no entrance animation', async () => {
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).not.toContain('tour-card');
    expect(dialog.querySelector('[data-typing]')).toBeNull();
    media({ reduce: false });
  });

  it('uses a bottom sheet on phones', async () => {
    media({ phone: true });
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-layout')).toBe('sheet');
    expect(dialog.className).toContain('inset-x-0');
    expect(dialog.className).toContain('safe-area-inset-bottom');
  });

  it('shows the attention pose for items that need you, and says so when AIR did nothing', async () => {
    const { unmount } = mount();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog.querySelector('[data-air-pose]')?.getAttribute('data-air-pose')).toBe(
        'attention',
      ),
    );
    unmount();
    getBriefing.mockResolvedValue(
      briefing({
        since: 'quiet',
        did_nothing: true,
        mood: 'idle',
        text: 'Since your last session AIR had nothing to do.',
        numbers: {},
      }),
    );
    mount();
    expect(await screen.findByRole('dialog', { name: 'A quiet session' })).toBeTruthy();
  });

  it('never shows a customer name or a phone number (it shows only the server template)', async () => {
    mount();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).not.toMatch(/\d{10}/);
    expect(dialog.textContent).not.toMatch(/@/);
  });

  it('has no axe violations', async () => {
    mount();
    const dialog = await screen.findByRole('dialog');
    const result = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('AirCharacter', () => {
  it('loads the pose as a sized WebP with its 512 px copy and never stretches it', () => {
    render(<AirCharacter pose="celebrate" />);
    const img = screen.getByRole('img', { name: AIR_ALT.celebrate });
    expect(img).toHaveAttribute('src', '/photos/air/air-10-celebrate.webp');
    expect(img.getAttribute('srcset')).toContain('/photos/air/air-10-celebrate-512.webp 512w');
    expect(img).toHaveAttribute('width', '1024');
    expect(img).toHaveAttribute('height', '1024');
    expect(img.className).toContain('object-contain');
    expect(img.parentElement!.className).toContain('aspect-square'); // no layout shift
  });

  it('falls back to air.webp, then the idle pose, when a pose file is missing or fails', () => {
    manifest.files = ['air/air.webp', 'air/air-02-idle.webp'];
    const { container, rerender } = render(<AirCharacter pose="sleep" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/photos/air/air.webp');
    expect(container.firstElementChild).toHaveAttribute('data-air-source', 'fallback');
    fireEvent.error(img);
    expect(container.querySelector('img')).toHaveAttribute('src', '/photos/air/air-02-idle.webp');
    manifest.files = ['air/air-02-idle.webp']; // air.webp missing (as today)
    rerender(<AirCharacter pose="handover" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/photos/air/air-02-idle.webp');
  });

  it('shows a bell icon when there is no picture at all', () => {
    manifest.files = [];
    render(<AirCharacter pose="welcome" />);
    expect(screen.getByRole('img', { name: 'AIR, the virtual receptionist' }).tagName).toBe('SPAN');
  });
});
