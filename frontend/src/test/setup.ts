import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';
import { applyTokens } from '../design/tokens';

// The logo splash plays once per browser session on public pages. Unit tests behave as if it has
// already been seen (the splash's own tests reset this), so no page test is covered by it.
try {
  window.sessionStorage.setItem('alankar-splash-seen', '1');
} catch {
  // no storage: the splash module then treats the page as unseen, and its tests handle that
}

// Slower machines (e.g. Windows with antivirus) need more than the 1 s default
// for findBy*/waitFor to see async renders (the first test of a file also loads lazy pages).
configure({ asyncUtilTimeout: 15000 });

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom does not have. Charts then
// measure 0 px and draw nothing; the summaries and data tables (what the tests read) still render.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeAll(() => {
  applyTokens();
});

afterEach(() => {
  cleanup();
});

// The notification bell polls this; unit tests never need a server for it.
vi.mock('../api/notifications', () => ({
  listNotifications: vi.fn(() => Promise.resolve({ unread: 0, results: [] })),
  markNotificationsRead: vi.fn(() => Promise.resolve({ unread: 0 })),
}));

// The guided tour reads its progress from the server; unit tests treat it as already finished so
// no invite appears (the tour's own tests override this mock).
vi.mock('../api/tours', () => ({
  getTourProgress: vi.fn(() => Promise.resolve({ 'tour:customer': 'completed' })),
  setTourStatus: vi.fn(() => Promise.resolve()),
  clearTour: vi.fn(() => Promise.resolve()),
}));

// AIR (the chat's virtual receptionist): pages that show the consent card or the desk callback list
// get harmless defaults; the AIR tests override this mock with their own.
vi.mock('../api/air', () => ({
  airChat: vi.fn(),
  airSendRequest: vi.fn(),
  airConfirm: vi.fn(),
  airStatus: vi.fn(() =>
    Promise.resolve({
      cover_active: false,
      ai_available: false,
      consent: 'none',
      consent_version: '1',
      consent_text: '',
    }),
  ),
  getAirConsent: vi.fn(() =>
    Promise.resolve({
      granted: false,
      granted_at: null,
      withdrawn_at: null,
      version: '',
      current_version: '1',
      text: '',
    }),
  ),
  setAirConsent: vi.fn(),
  listCallbacks: vi.fn(() => Promise.resolve([])),
  markCallbackDone: vi.fn(),
}));

// AIR Task 3: the receptionist's popup asks for a briefing. By default it never arrives in unit
// tests (no popup over other pages' tests); the AIR tests override this mock.
vi.mock('../api/airDesk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/airDesk')>()),
  getAirBriefing: vi.fn(() => new Promise(() => {})),
}));
