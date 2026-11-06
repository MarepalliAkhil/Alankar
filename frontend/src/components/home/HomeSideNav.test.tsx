import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { HOME_SECTIONS } from '../../hooks/useHomeChapter';
import { HomeSideNav } from './HomeSideNav';

function mount(chapter: 1 | 2 | 3 | 4) {
  return render(
    <ThemeProvider>
      {HOME_SECTIONS.map((s) => (
        <section key={s.id} id={s.id} tabIndex={-1} />
      ))}
      <HomeSideNav chapter={chapter} />
    </ThemeProvider>,
  );
}

describe('HomeSideNav', () => {
  it('has four dots (Alankar, Salon, Spa, Parlor) and marks the active one with aria-current', () => {
    mount(3);
    const nav = screen.getByRole('navigation', { name: 'Home sections' });
    const buttons = nav.querySelectorAll('button');
    expect([...buttons].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Alankar',
      'Salon',
      'Spa',
      'Parlor',
    ]);
    expect(screen.getByRole('button', { name: 'Spa' })).toHaveAttribute('aria-current', 'true');
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Salon' })).not.toHaveAttribute('aria-current');
  });

  it('jumps to its section on click and on the keyboard', async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    mount(1);
    await user.click(screen.getByRole('button', { name: 'Parlor' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('home-parlor'));
    screen.getByRole('button', { name: 'Salon' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(document.getElementById('home-salon'));
    await user.keyboard('{Tab}');
    screen.getByRole('button', { name: 'Spa' }).focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(document.getElementById('home-spa'));
  });
});
