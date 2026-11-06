import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlankarIcon, alankarIcons, type AlankarIconName } from './AlankarIcon';

describe('AlankarIcon', () => {
  it.each(Object.keys(alankarIcons) as AlankarIconName[])(
    '%s draws with the shared stroke',
    (name) => {
      const { container } = render(<AlankarIcon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('stroke-width')).toBe('1.6');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('path,circle,ellipse,rect').length).toBeGreaterThan(0);
    },
  );

  it('names a standalone icon for screen readers', () => {
    const { getByRole } = render(<AlankarIcon name="star" title="Rating" />);
    expect(getByRole('img', { name: 'Rating' })).toBeInTheDocument();
  });
});
