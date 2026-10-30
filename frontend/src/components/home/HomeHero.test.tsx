import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routerFuture } from '../../config/router';
import { ThemeProvider } from '../../design/ThemeProvider';
import { themeVariables } from '../../design/tokens';
import { site } from '../../test/fixtures';
import { HomeHero } from './HomeHero';

function mockMedia({ wide, reduced }: { wide: boolean; reduced: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (query.includes('min-width') && wide) ||
      (query.includes('reduced-motion') && reduced) ||
      false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function renderHero() {
  return render(
    <ThemeProvider>
      <MemoryRouter future={routerFuture}>
        <HomeHero
          site={site}
          loading={false}
          book="/login?role=customer"
          staffHome={null}
          tel="+919000000000"
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home hero', () => {
  it('on wide screens, scrolls through Salon, Spa and Beauty Parlor with blended theme colours', () => {
    mockMedia({ wide: true, reduced: false });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const { container } = renderHero();
    const section = container.querySelector<HTMLElement>('[data-hero="scroll"]');
    expect(section).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Look good. Feel calm.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book Now' })).toHaveAttribute(
      'href',
      '/login?role=customer',
    );
    expect(screen.getByRole('link', { name: /Call salon/ })).toHaveAttribute(
      'href',
      'tel:+919000000000',
    );

    // Starts on the Salon stage: Salon colours, only the Salon panel is exposed.
    const mode = document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
    expect(section!.style.getPropertyValue('--color-primary')).toBe(
      themeVariables('salon', mode)['--color-primary'],
    );
    expect(screen.getByRole('link', { name: 'Explore Salon' })).toHaveAttribute('href', '/salon');
    const panels = within(screen.getByRole('group', { name: 'Our three divisions' }));
    expect(panels.getByRole('article', { name: 'Salon' })).toBeInTheDocument();
    expect(panels.queryByRole('article', { name: 'Spa' })).toBeNull(); // aria-hidden
    expect(screen.getByRole('button', { name: 'Show Salon' })).toHaveAttribute(
      'aria-current',
      'step',
    );

    // Halfway down the hero: the Spa stage.
    vi.spyOn(section!, 'getBoundingClientRect').mockReturnValue({
      top: -1000,
      height: 3000,
    } as DOMRect);
    vi.stubGlobal('innerHeight', 1000);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(section!.style.getPropertyValue('--color-primary')).toBe(
      themeVariables('spa', mode)['--color-primary'],
    );
    expect(screen.getByRole('link', { name: 'Explore Spa' })).toHaveAttribute('href', '/spa');
    expect(panels.getByRole('article', { name: 'Spa' })).toBeInTheDocument();
    expect(section!.style.getPropertyValue('--hero-w1')).toBe('1.0000');
  });

  it('on phones and with reduced motion, shows stacked sections in each division theme', () => {
    mockMedia({ wide: true, reduced: true });
    const { container } = renderHero();
    expect(container.querySelector('[data-hero="stacked"]')).not.toBeNull();
    expect(container.querySelector('[data-hero="scroll"]')).toBeNull();
    for (const [label, theme] of [
      ['Salon', 'salon'],
      ['Spa', 'spa'],
      ['Beauty Parlor', 'parlor'],
    ]) {
      const article = screen.getByRole('article', { name: label });
      expect(article.closest('[data-theme]')).toHaveAttribute('data-theme', theme);
      expect(within(article).getByRole('heading', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
