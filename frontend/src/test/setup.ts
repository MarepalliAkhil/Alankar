import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';
import { applyTokens } from '../design/tokens';

// Slower machines (e.g. Windows with antivirus) need more than the 1 s default
// for findBy*/waitFor to see async renders (the first test of a file also loads lazy pages).
configure({ asyncUtilTimeout: 15000 });

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
