import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { HomeBackdrop } from './HomeBackdrop';

const mount = (chapter: 1 | 2 | 3 | 4) =>
  render(
    <ThemeProvider>
      <HomeBackdrop chapter={chapter} />
    </ThemeProvider>,
  );

describe('HomeBackdrop', () => {
  it('is decorative, out of the layout flow and loads only the current and next picture', () => {
    const { container } = mount(2);
    const root = container.querySelector('[data-home-backdrop]') as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toMatch(/sticky/);
    expect(root.className).toMatch(/-mb-\[100svh\]/);
    const layers = [...container.querySelectorAll('[data-home-layer]')].map((el) =>
      el.getAttribute('data-home-layer'),
    );
    expect(layers).toEqual(['2', '3']);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(2);
  });

  it('marks the current chapter and crossfades when it changes', () => {
    const { container, rerender } = mount(1);
    expect(container.querySelector('[data-home-layer="1"]')?.className).toMatch(/is-current/);
    rerender(
      <ThemeProvider>
        <HomeBackdrop chapter={3} />
      </ThemeProvider>,
    );
    expect(container.querySelector('[data-home-backdrop]')?.getAttribute('data-chapter')).toBe('3');
    expect(container.querySelector('[data-home-layer="3"]')?.className).toMatch(/is-current/);
    // the chapter just left stays mounted for the length of the fade
    expect(container.querySelector('[data-home-layer="1"]')?.className).not.toMatch(/is-current/);
  });

  it('shows Alankar, Salon, Spa and Parlor in that order', () => {
    const slots = [1, 2, 3, 4].map((n) => {
      const { container, unmount } = mount(n as 1 | 2 | 3 | 4);
      const frame = container.querySelector(`[data-home-layer="${n}"] [data-art-frame]`);
      const slot = frame?.getAttribute('data-art-frame');
      unmount();
      return slot;
    });
    expect(slots).toEqual([
      'shopBackground',
      'salonBackground',
      'spaBackground',
      'parlorBackground',
    ]);
  });

  it('tints each picture in its own division theme', () => {
    const { container } = mount(2);
    expect(container.querySelector('[data-home-layer="2"] [data-theme]')).toBeTruthy();
  });
});
