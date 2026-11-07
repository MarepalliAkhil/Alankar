import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { DivisionHero } from './DivisionHero';

vi.mock('virtual:photo-manifest', () => ({
  default: [
    'salon-hero.webp',
    'salon-hero.jpg',
    'salon-hero-640.webp',
    'salon-hero-640.jpg',
    'spa-hero.webp',
    'spa-hero.jpg',
    'parlor-hero.webp',
    'parlor-hero.jpg',
  ],
}));
vi.mock('virtual:photo-placeholders', () => ({ default: {} }));

const categories = [
  { slug: 'hair', name: 'Hair' },
  { slug: 'beard', name: 'Beard and shave' },
];

function show(id: 'salon' | 'spa' | 'beauty-parlor', extra = {}) {
  const pick = vi.fn();
  render(
    <ThemeProvider>
      <MemoryRouter>
        <DivisionHero
          id={id}
          theme="salon"
          label="Salon"
          summary="Cuts, colour and grooming."
          facts="9 services · Every price includes GST."
          book="/book"
          tel="+911234567890"
          categories={categories}
          onPickCategory={pick}
          {...extra}
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
  return pick;
}

describe('DivisionHero', () => {
  it.each(['salon', 'spa', 'beauty-parlor'] as const)(
    '%s: one picture only, no framed copy and no floating icon pill',
    (id) => {
      show(id);
      const header = document.querySelector<HTMLElement>(`[data-division-hero="${id}"]`)!;
      expect(header.querySelectorAll('[data-art-frame]')).toHaveLength(1);
      expect(header.querySelectorAll('img')).toHaveLength(1);
      expect(header.querySelector('.shape-arch, .shape-leaf, .aspect-\\[4\\/5\\]')).toBeNull();
      expect(header.querySelector('svg[data-alankar-icon]')).toBeNull();
      expect(header.querySelector('img')).toHaveAttribute('loading', 'eager');
    },
  );

  it('uses the focal points from photo-focus.json for desktop and phone', () => {
    show('salon');
    const frame = document.querySelector<HTMLElement>('[data-art-frame="salonHero"]')!;
    expect(frame.style.getPropertyValue('--art-pos')).toBe('50% 60%');
    expect(frame.style.getPropertyValue('--art-pos-mobile')).toBe('74% 58%');
  });

  it('shows the real categories as chips and passes the choice on', () => {
    const pick = show('salon');
    const nav = screen.getByRole('navigation', { name: 'Salon categories' });
    const chips = within(nav).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Hair', 'Beard and shave']);
    fireEvent.click(chips[1]!);
    expect(pick).toHaveBeenCalledWith('beard');
  });

  it('shows no chips when the division has no categories', () => {
    show('spa', { categories: [] });
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('has the heading, the summary, the facts and the actions', () => {
    show('salon');
    expect(screen.getByRole('heading', { level: 1, name: 'Salon' })).toBeInTheDocument();
    expect(screen.getByText('Cuts, colour and grooming.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book now' })).toHaveClass('min-h-11');
    expect(screen.getByRole('link', { name: /Call the salon/ })).toHaveAttribute(
      'href',
      'tel:+911234567890',
    );
  });
});
