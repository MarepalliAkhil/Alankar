import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../design/ThemeProvider';
import { PORTRAIT_MOBILE_QUERY } from '../../design/viewport-image';
import { ArtImage } from './ArtImage';

vi.mock('virtual:photo-manifest', () => ({
  default: [
    // salon-background: width variants and a portrait photo with its own variants
    'salon-background.webp',
    'salon-background.jpg',
    'salon-background-640.webp',
    'salon-background-640.jpg',
    'salon-background-1080.webp',
    'salon-background-1080.jpg',
    'salon-background-1600.webp',
    'salon-background-1600.jpg',
    'salon-background-mobile.webp',
    'salon-background-mobile.jpg',
    'salon-background-mobile-640.webp',
    'salon-background-mobile-640.jpg',
    // spa-background: only the plain files and the older 960 copy (no portrait photo)
    'spa-background.webp',
    'spa-background.jpg',
    'spa-background-960.webp',
    'spa-background-960.jpg',
    // parlor-background: nothing but one file
    'parlor-background.webp',
  ],
}));
vi.mock('virtual:photo-placeholders', () => ({
  default: { 'salon-background': 'data:image/webp;base64,AAAA' },
}));

const frame = (slot: string) => document.querySelector<HTMLElement>(`[data-art-frame="${slot}"]`)!;
const show = (slot: 'salonBackground' | 'spaBackground' | 'parlorBackground', band = false) =>
  render(
    <ThemeProvider>
      <ArtImage slot={slot} priority band={band} sizes="100vw" />
    </ThemeProvider>,
  );

describe('ArtImage: width variants and the portrait photo', () => {
  it('puts the portrait sources first, with the screen-shape media query', () => {
    show('salonBackground');
    const sources = Array.from(frame('salonBackground').querySelectorAll('source'));
    expect(sources.map((s) => [s.getAttribute('media'), s.getAttribute('type')])).toEqual([
      [PORTRAIT_MOBILE_QUERY, 'image/webp'],
      [PORTRAIT_MOBILE_QUERY, null],
      [null, 'image/webp'],
    ]);
    expect(PORTRAIT_MOBILE_QUERY).toBe('(orientation: portrait) and (max-width: 900px)');
    expect(frame('salonBackground')).toHaveAttribute('data-portrait', 'photo');
  });

  it('keeps srcset and sizes inside each source and on the image', () => {
    show('salonBackground');
    const [portraitWebp, portraitJpg, landscapeWebp] = Array.from(
      frame('salonBackground').querySelectorAll('source'),
    );
    expect(portraitWebp!.getAttribute('srcset')).toBe(
      '/photos/salon-background-mobile-640.webp 640w, /photos/salon-background-mobile.webp 1080w',
    );
    expect(portraitJpg!.getAttribute('srcset')).toContain('salon-background-mobile-640.jpg 640w');
    expect(landscapeWebp!.getAttribute('srcset')).toBe(
      '/photos/salon-background-640.webp 640w, /photos/salon-background-1080.webp 1080w, /photos/salon-background.webp 1600w',
    );
    for (const source of [portraitWebp!, portraitJpg!, landscapeWebp!]) {
      expect(source.getAttribute('sizes')).toBe('100vw');
    }
    const img = frame('salonBackground').querySelector('img')!;
    expect(img.getAttribute('srcset')).toContain('salon-background-640.jpg 640w');
    expect(img.getAttribute('sizes')).toBe('100vw');
    expect(img).toHaveAttribute('src', '/photos/salon-background.jpg');
  });

  it('works with only the older 960 px copy (before the new optimizer has run)', () => {
    show('spaBackground');
    const f = frame('spaBackground');
    expect(f).toHaveAttribute('data-portrait', 'none');
    const sources = Array.from(f.querySelectorAll('source'));
    expect(sources).toHaveLength(1);
    expect(sources[0]!.getAttribute('media')).toBeNull();
    expect(sources[0]!.getAttribute('srcset')).toContain('spa-background-960.webp 960w');
    expect(f.querySelector('img')!.getAttribute('srcset')).toContain('spa-background-960.jpg 960w');
  });

  it('works with a single file and no variants', () => {
    show('parlorBackground');
    const f = frame('parlorBackground');
    expect(f.querySelector('source')).toBeNull();
    const img = f.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/photos/parlor-background.webp');
    expect(img).not.toHaveAttribute('srcset');
    expect(img).not.toHaveAttribute('sizes');
  });

  it('uses the short band when a background has no portrait photo, and not when it has one', () => {
    show('spaBackground', true);
    expect(frame('spaBackground')).toHaveAttribute('data-band', 'true');
    show('salonBackground', true);
    expect(frame('salonBackground')).not.toHaveAttribute('data-band');
  });

  it('replaces the blurred preview with the sharp photo once it has loaded', () => {
    show('salonBackground');
    const f = frame('salonBackground');
    expect(f).toHaveAttribute('data-loaded', 'false');
    expect(f.style.getPropertyValue('--art-preview')).toContain('data:image/webp');
    fireEvent.load(f.querySelector('img')!);
    expect(f).toHaveAttribute('data-loaded', 'true');
    expect(f.querySelector('img')).toHaveClass('is-loaded');
  });
});
