import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routerFuture } from '../../config/router';
import { ThemeProvider } from '../../design/ThemeProvider';
import { site } from '../../test/fixtures';
import { HomeHero } from './HomeHero';

function renderHero(staffHome: string | null = null, loaded = true) {
  return render(
    <ThemeProvider>
      <MemoryRouter future={routerFuture}>
        <HomeHero
          site={loaded ? site : undefined}
          loading={!loaded}
          book="/login?role=customer"
          staffHome={staffHome}
          tel="+919000000000"
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('HomeHero', () => {
  it('says what the shop is and offers one clear primary action', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/book it online/i);
    expect(screen.getByText(/salon, a spa and a beauty parlor/i)).toBeTruthy();
    const book = screen.getByRole('link', { name: 'Book a visit' });
    expect(book.getAttribute('href')).toBe('/login?role=customer');
  });

  it('shows the real address, phone and hours from the shop settings', () => {
    const real = {
      ...site,
      contact: { ...site.contact, address: 'MG Road, Vijayawada', phone: '+91 98480 12345' },
    };
    render(
      <ThemeProvider>
        <MemoryRouter future={routerFuture}>
          <HomeHero
            site={real}
            loading={false}
            book="/login?role=customer"
            staffHome={null}
            tel="+919848012345"
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const details = screen.getByRole('list', { name: 'Visit details' });
    expect(details.textContent).toContain('MG Road, Vijayawada');
    expect(screen.getByRole('link', { name: '+91 98480 12345' })).toBeTruthy();
    expect(details.textContent).toContain(site.hours![0]!.days);
  });

  it('never shows placeholder demo details (address or phone) as if they were real', () => {
    renderHero();
    const details = screen.getByRole('list', { name: 'Visit details' });
    expect(details.textContent).not.toContain('Demo address');
    expect(screen.queryByRole('link', { name: site.contact!.phone })).toBeNull();
  });

  it('sends signed-in staff to their dashboard instead of the booking flow', () => {
    renderHero('/admin');
    expect(screen.queryByRole('link', { name: 'Book a visit' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to your dashboard' }).getAttribute('href')).toBe(
      '/admin',
    );
  });

  it('does not invent details while the settings load', () => {
    renderHero(null, false);
    expect(screen.getByText(/Loading hours and address/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^\+?\d/ })).toBeNull();
  });
});

describe('HomeHero (full-screen background version)', () => {
  it('has no right-hand photo card and no caption toast, and keeps the approval sentence in its card', () => {
    const { container } = renderHero();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-art-frame]')).toBeNull();
    expect(container.querySelector('.shape-arch')).toBeNull();
    const card = container.querySelector('.glass-photo')!;
    expect(card.textContent).toContain(
      'Your stylist and the front desk both say yes before anything is final.',
    );
    // said once, not twice
    expect(container.textContent!.split('both say yes').length).toBe(2);
  });
});
