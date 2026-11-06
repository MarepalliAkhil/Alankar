import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { ArtImage } from './ArtImage';

vi.mock('virtual:photo-manifest', () => ({
  default: [
    'spa-hero.png',
    'spa-hero.JPG',
    'spa-hero.webp',
    'salon-hero.jpeg',
    'salon-hero.png',
    'shop-background.webp',
    'shop-background.jpg',
    'shop-background-960.webp',
    'shop-background-960.jpg',
  ],
}));
vi.mock('virtual:photo-placeholders', () => ({
  default: {
    'spa-hero': 'data:image/webp;base64,AAAA',
    'shop-background': 'data:image/webp;base64,BBBB',
  },
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
    expect(img).toHaveClass('object-cover');
    expect(f.style.getPropertyValue('--art-preview')).toBe('url("data:image/webp;base64,AAAA")');
    expect(f.style.getPropertyValue('--art-zoom')).toBe('1');
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
    // No optimised preview for this photo: nothing is blurred behind it.
    expect(frame('salonHero').style.getPropertyValue('--art-preview')).toBe('');
  });

  it('a given crop is applied without changing the photo (a header that differs from the background)', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="shopBackground" crop={{ position: '78% 50%', zoom: 1.5 }} />
      </ThemeProvider>,
    );
    const f = frame('shopBackground');
    expect(f.querySelector('img')).toHaveAttribute('data-photo', 'shop-background');
    expect(f.style.getPropertyValue('--art-pos')).toBe('78% 50%');
    expect(f.style.getPropertyValue('--art-zoom')).toBe('1.5');
    expect(f.style.getPropertyValue('--art-preview')).toContain('BBBB');
  });

  it('offers the 960 px copy to small screens through srcset and sizes', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="shopBackground" sizes="50vw" />
      </ThemeProvider>,
    );
    const f = frame('shopBackground');
    const source = f.querySelector('source')!;
    expect(source).toHaveAttribute(
      'srcset',
      '/photos/shop-background-960.webp 960w, /photos/shop-background.webp 1920w',
    );
    expect(source).toHaveAttribute('sizes', '50vw');
    expect(f.querySelector('img')).toHaveAttribute(
      'srcset',
      '/photos/shop-background-960.jpg 960w, /photos/shop-background.jpg 1920w',
    );
  });

  it('with no photo anywhere it shows a plain gradient, never an image or a drawing', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="parlorHero" />
      </ThemeProvider>,
    );
    const f = frame('parlorHero');
    expect(f).toHaveAttribute('data-source', 'gradient');
    expect(f.querySelector('img')).toBeNull();
    expect(f.querySelector('source')).toBeNull();
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
