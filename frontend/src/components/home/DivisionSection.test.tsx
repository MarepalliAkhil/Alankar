import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Service } from '../../api/public';
import { routerFuture } from '../../config/router';
import { ThemeProvider } from '../../design/ThemeProvider';
import { DivisionSection } from './DivisionSection';

const svc = (id: string, name: string, division: Service['division'], price = '500') =>
  ({ id, name, division, from_price: price, slug: id }) as unknown as Service;
const services = [
  svc('1', 'Classic haircut', 'salon', '400'),
  svc('2', 'Deep tissue massage', 'spa', '1800'),
  svc('3', 'Bridal makeup', 'beauty-parlor', '9000'),
];

function mount(id: 'salon' | 'spa' | 'beauty-parlor', bookTo: string | null = '/customer/book') {
  return render(
    <ThemeProvider>
      <MemoryRouter future={routerFuture}>
        <DivisionSection
          id={id}
          services={services}
          loading={false}
          bookTo={bookTo}
          onOpenService={() => undefined}
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DivisionSection', () => {
  it.each([
    ['salon', 'Book salon', 'Classic haircut', '2', 'home-salon'],
    ['spa', 'Book spa', 'Deep tissue massage', '3', 'home-spa'],
    ['beauty-parlor', 'Book beauty parlor', 'Bridal makeup', '4', 'home-parlor'],
  ] as const)(
    '%s: glass card, real services and a booking button',
    (id, button, name, chapter, anchor) => {
      const { container } = mount(id);
      const section = container.querySelector('section')!;
      expect(section).toHaveAttribute('data-home-chapter', chapter);
      expect(section).toHaveAttribute('id', anchor);
      expect(container.querySelector('.glass-photo')).toBeTruthy();
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: button })).toHaveAttribute('href', '/customer/book');
      // only this division's services
      expect(container.querySelectorAll('li')).toHaveLength(1);
    },
  );

  it('staff get no booking button', () => {
    mount('spa', null);
    expect(screen.queryByRole('link', { name: /^Book/ })).toBeNull();
  });
});
