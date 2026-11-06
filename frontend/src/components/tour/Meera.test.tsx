import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Meera } from './Meera';
import { MEERA_ALT, MEERA_POSES, meeraSlot } from './meera-data';

const manifest = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock('virtual:photo-manifest', () => ({
  get default() {
    return manifest.files;
  },
}));

beforeEach(() => {
  manifest.files = [];
});

describe('Meera (owner pictures)', () => {
  it('has sixteen poses with their own slot and alt text', () => {
    expect(MEERA_POSES).toEqual([
      'wave',
      'point',
      'phone',
      'approve',
      'chat',
      'wallet',
      'stars',
      'shield',
      'celebrate',
      'namaste',
      'scissors',
      'calendar',
      'waiting',
      'sorry',
      'gift',
      'package',
    ]);
    expect(new Set(Object.values(MEERA_ALT)).size).toBe(16);
    expect(MEERA_ALT.wave).toBe('Meera, your stylist guide, waving');
    expect(meeraSlot('wave')).toBe('meera-wave');
  });

  it.each(MEERA_POSES)('shows the %s picture, sized and lazy, with its alt text', (pose) => {
    manifest.files = [`meera/meera-${pose}.webp`];
    render(<Meera pose={pose} />);
    const img = screen.getByRole('img', { name: MEERA_ALT[pose] });
    expect(img).toHaveAttribute('src', `/photos/meera/meera-${pose}.webp`);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '820');
    expect(img).toHaveAttribute('height', '1024');
  });

  it('shows a plain-background jpg as a framed image and a cut-out free-standing', () => {
    manifest.files = ['meera/meera-wave.jpg', 'meera/meera-point.png'];
    const { container } = render(
      <>
        <Meera pose="wave" />
        <Meera pose="point" />
      </>,
    );
    expect(container.querySelector('[data-meera="wave"] img')!.className).toContain('meera-framed');
    expect(container.querySelector('[data-meera="point"] img')!.className).not.toContain(
      'meera-framed',
    );
  });

  it('shows a glass circle with the letter M when the picture is missing', () => {
    const { container } = render(<Meera pose="chat" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-meera-source="letter"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: MEERA_ALT.chat })).toHaveTextContent('M');
  });

  describe('default picture (meera.*)', () => {
    it.each(MEERA_POSES)(
      'shows meera.webp for the %s pose when it has no file of its own',
      (pose) => {
        manifest.files = ['meera/meera.webp', 'meera/meera.png'];
        const { container } = render(<Meera pose={pose} />);
        const img = screen.getByRole('img', { name: 'Meera, your stylist guide' });
        expect(img).toHaveAttribute('src', '/photos/meera/meera.png');
        expect(container.querySelector('source')).toHaveAttribute(
          'srcset',
          '/photos/meera/meera.webp',
        );
        expect(container.querySelector('[data-meera-source="default"]')).not.toBeNull();
        expect(container.querySelector('[data-meera-source="letter"]')).toBeNull();
      },
    );

    it('uses a pose file as soon as it exists, and the default for the other poses', () => {
      manifest.files = ['meera/meera.webp', 'meera/meera-wave.webp'];
      const { container } = render(
        <>
          <Meera pose="wave" />
          <Meera pose="chat" />
        </>,
      );
      expect(container.querySelector('[data-meera="wave"] img')).toHaveAttribute(
        'src',
        '/photos/meera/meera-wave.webp',
      );
      expect(container.querySelector('[data-meera="wave"]')).toHaveAttribute(
        'data-meera-source',
        'image',
      );
      expect(container.querySelector('[data-meera="chat"] img')).toHaveAttribute(
        'src',
        '/photos/meera/meera.webp',
      );
      expect(container.querySelector('[data-meera="chat"]')).toHaveAttribute(
        'data-meera-source',
        'default',
      );
    });

    it('falls back to the default when a pose file fails to load, then to the letter', () => {
      manifest.files = ['meera/meera.webp', 'meera/meera-stars.webp'];
      const { container } = render(<Meera pose="stars" decorative />);
      fireEvent.error(container.querySelector('img')!);
      expect(container.querySelector('img')).toHaveAttribute('src', '/photos/meera/meera.webp');
      fireEvent.error(container.querySelector('img')!);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-meera-source="letter"]')).not.toBeNull();
    });

    it('keeps the letter circle only when meera.* itself is missing', () => {
      manifest.files = ['meera/meera-point.webp'];
      const { container } = render(<Meera pose="chat" />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-meera-source="letter"]')).not.toBeNull();
    });
  });

  it('falls back to the letter when the picture fails to load', () => {
    manifest.files = ['meera/meera-stars.webp'];
    const { container } = render(<Meera pose="stars" decorative />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-meera-source="letter"]')).not.toBeNull();
  });

  it('is hidden from screen readers when decorative', () => {
    manifest.files = ['meera/meera-wave.webp'];
    const { container } = render(<Meera pose="wave" decorative />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
  });
});
