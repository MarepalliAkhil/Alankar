import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { ArtImage } from './ArtImage';

vi.mock('virtual:photo-manifest', () => ({
  default: ['spa-hero.png', 'spa-hero.JPG', 'spa-hero.webp', 'salon-hero.jpeg', 'salon-hero.png'],
}));
vi.mock('virtual:photo-placeholders', () => ({
  default: { 'spa-hero': 'data:image/webp;base64,AAAA' },
}));

function frame(slot: string) {
  return document.querySelector<HTMLElement>(`[data-art-frame="${slot}"]`)!;
}

describe('ArtImage', () => {
  it('uses WebP with a JPG fallback, a blurred preview, cover fit and explicit size', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="spaHero" priority overlay />
      </ThemeProvider>,
    );
    const f = frame('spaHero');
    expect(f).toHaveAttribute('data-source', 'photo');
    expect(f.querySelector('source')).toHaveAttribute('srcset', '/photos/spa-hero.webp');
    const img = f.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/photos/spa-hero.JPG');
    expect(img).toHaveAttribute('width', '1920');
    expect(img).toHaveAttribute('height', '1080');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveClass('object-cover', 'object-center');
    expect(f.style.getPropertyValue('--art-preview')).toBe('url("data:image/webp;base64,AAAA")');
    expect(f.querySelector('.art-scrim')).not.toBeNull();
  });

  it('prefers jpeg over png and lazy-loads below the fold', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="salonHero" />
      </ThemeProvider>,
    );
    const img = frame('salonHero').querySelector('img')!;
    expect(img).toHaveAttribute('src', '/photos/salon-hero.jpeg');
    expect(img).toHaveAttribute('loading', 'lazy');
    // No optimised preview for this photo: the blurred artwork stands in while it loads.
    expect(frame('salonHero').style.getPropertyValue('--art-preview')).toMatch(/^url\(/);
  });

  it('shows the generated artwork when there is no photo (nothing is requested from /photos)', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="parlorHero" />
      </ThemeProvider>,
    );
    const f = frame('parlorHero');
    expect(f).toHaveAttribute('data-source', 'art');
    expect(f.querySelector('img')!.getAttribute('src')).not.toMatch(/\/photos\//);
    expect(f.querySelector('source')).toBeNull();
    expect(f.style.getPropertyValue('--art-preview')).toBe('');
  });

  it('an image set by the admin wins over the photo', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="spaHero" override="https://cdn.example.com/hero.jpg" />
      </ThemeProvider>,
    );
    const f = frame('spaHero');
    expect(f).toHaveAttribute('data-source', 'admin');
    expect(f.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/hero.jpg');
    expect(f.querySelector('source')).toBeNull();
  });
});
