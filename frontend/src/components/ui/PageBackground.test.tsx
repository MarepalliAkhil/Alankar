import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routerFuture } from '../../config/router';
import { ThemeProvider } from '../../design/ThemeProvider';
import { setBookingDivision } from '../../design/page-background';
import { PageBackground } from './PageBackground';

vi.mock('virtual:photo-manifest', () => ({
  default: [
    'shop-background.webp',
    'salon-background.webp',
    'spa-background.webp',
    'parlor-background.webp',
  ],
}));
const session = vi.hoisted(() => ({ user: null as null | { role: string } }));
vi.mock('../../session/session-context', () => ({ useSession: () => ({ user: session.user }) }));

const at = (path: string) =>
  render(
    <ThemeProvider>
      <MemoryRouter future={routerFuture} initialEntries={[path]}>
        <PageBackground />
      </MemoryRouter>
    </ThemeProvider>,
  );

afterEach(() => {
  setBookingDivision(null);
  session.user = null;
  vi.useRealTimers();
});

describe('PageBackground', () => {
  it('shows nothing on the home page', () => {
    const { container } = at('/');
    expect(container.querySelector('[data-page-backdrop]')).toBeNull();
  });

  it('is decorative, fixed and full window, with the Alankar photo on ordinary pages', () => {
    const { container } = at('/customer/wallet');
    const root = container.querySelector('[data-page-backdrop]')!;
    expect(root.getAttribute('data-page-backdrop')).toBe('shopBackground');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.className).toMatch(/fixed/);
    expect(root.className).toMatch(/inset-0/);
    expect(root.querySelector('img')).toHaveAttribute('alt', '');
    expect(root.querySelector('.art-scrim')).not.toBeNull();
  });

  it('blurs a little for customers and more for staff pages', () => {
    session.user = { role: 'customer' };
    expect(at('/customer/wallet').container.querySelector('[data-blur]')).toHaveAttribute(
      'data-blur',
      'soft',
    );
    session.user = { role: 'admin' };
    expect(at('/dashboard').container.querySelector('[data-blur]')).toHaveAttribute(
      'data-blur',
      'strong',
    );
  });

  it('crossfades to the new division when the booking division changes', () => {
    vi.useFakeTimers();
    const { container } = at('/customer/book');
    expect(container.querySelector('[data-page-backdrop]')).toHaveAttribute(
      'data-page-backdrop',
      'shopBackground',
    );
    act(() => setBookingDivision('spa'));
    expect(container.querySelector('[data-page-backdrop]')).toHaveAttribute(
      'data-page-backdrop',
      'spaBackground',
    );
    // the old picture stays under the new one while it fades in, then goes
    expect(container.querySelectorAll('[data-backdrop-layer]')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelectorAll('[data-backdrop-layer]')).toHaveLength(1);
    act(() => setBookingDivision('salon'));
    expect(container.querySelector('[data-page-backdrop]')).toHaveAttribute(
      'data-page-backdrop',
      'salonBackground',
    );
    act(() => setBookingDivision(null));
    expect(container.querySelector('[data-page-backdrop]')).toHaveAttribute(
      'data-page-backdrop',
      'shopBackground',
    );
  });

  it('tints the booking page in the division theme', () => {
    at('/customer/book');
    act(() => setBookingDivision('spa'));
    expect(document.documentElement.dataset.theme).toBe('spa');
  });
});
