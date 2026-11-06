import { useEffect, useRef, useState } from 'react';
import photos from 'virtual:photo-manifest';
import { photoSources } from '../../design/art';
import { cn } from '../../lib/cn';
import {
  MEERA_ALT,
  MEERA_DEFAULT_ALT,
  MEERA_DEFAULT_SLOT,
  meeraSlot,
  type MeeraPose,
} from './meera-data';

export interface MeeraProps {
  pose: MeeraPose;
  className?: string;
  /** Hidden from screen readers (her words are shown next to her). */
  decorative?: boolean;
  /** Small moments and tips: draw nothing (no "M" circle) when no picture can be shown. */
  quiet?: boolean;
}

/** A file type that can never have see-through parts. */
const isFlat = (src: string) => /\.jpe?g$/i.test(src);

/** True when the picture has a clearly see-through corner (a cut-out); false for a plain background (a few transparent padding pixels at an edge do not count). */
function hasTransparentCorner(img: HTMLImageElement): boolean | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    return ctx.getImageData(0, 0, 1, 1).data[3] < 128;
  } catch {
    return null;
  }
}

/**
 * Meera, the tour guide: the owner's 3D character picture for a pose, lazy-loaded at a fixed
 * size (no layout shift) with a gentle CSS-only float and shadow pulse. A cut-out (see-through
 * background) stands free; a picture with a plain background is shown as a rounded image with a
 * soft theme-tinted frame and faded edges. A pose without its own file shows the default picture
 * (`meera.*`); a pose file added later is picked up automatically. Only when that is missing too
 * (or fails to load) does a glass circle with the letter "M" show, so the tour never waits for or
 * breaks on an image.
 */
export function Meera({ pose, className, decorative = false, quiet = false }: MeeraProps) {
  const own = photoSources({ photo: meeraSlot(pose) }, photos);
  const fallback = photoSources({ photo: MEERA_DEFAULT_SLOT }, photos);
  const [failed, setFailed] = useState<string[]>([]);
  // The pose's own picture first; the default one when it is missing or failed to load.
  const found = own && !failed.includes(own.src) ? own : fallback;
  const isDefault = found !== own;
  const src = found?.src ?? null;
  // The 512 px tall copy (`<name>-512.webp`), when it exists, for phones and small stages.
  const bigWebp = found?.webp ?? (src && /\.webp$/i.test(src) ? src : null);
  const smallName = bigWebp?.replace(/^\/photos\//, '').replace(/\.webp$/i, '-512.webp');
  const smallCopy = smallName && photos.includes(smallName) ? `/photos/${smallName}` : null;
  const [cutout, setCutout] = useState<boolean | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const usable = !!src && !failed.includes(src);
  const flat = src ? isFlat(src) : false;
  const free = flat ? false : (cutout ?? true);

  useEffect(() => {
    setCutout(null);
  }, [src]);

  const check = () => {
    if (img.current && !flat) setCutout(hasTransparentCorner(img.current));
  };

  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (quiet && !usable) return null;
  return (
    <div
      data-meera={pose}
      aria-hidden={decorative || undefined}
      data-meera-source={usable ? (isDefault ? 'default' : 'image') : 'letter'}
      className={cn('relative shrink-0', className)}
    >
      {usable ? (
        <>
          <span
            aria-hidden="true"
            className="meera-shadow absolute bottom-0 left-1/2 h-2 w-3/5 -translate-x-1/2 rounded-full bg-text/25 blur-sm"
          />
          <picture>
            {found?.webp && (
              <source
                srcSet={smallCopy ? `${smallCopy} 410w, ${found.webp} 820w` : found.webp}
                sizes="(max-width: 640px) 40vw, 200px"
                type="image/webp"
              />
            )}
            <img
              key={src}
              ref={img}
              src={src!}
              srcSet={!found?.webp && smallCopy ? `${smallCopy} 410w, ${src} 820w` : undefined}
              sizes={!found?.webp && smallCopy ? '(max-width: 640px) 40vw, 200px' : undefined}
              alt={decorative ? '' : isDefault ? MEERA_DEFAULT_ALT : MEERA_ALT[pose]}
              aria-hidden={decorative || undefined}
              width={820}
              height={1024}
              loading="lazy"
              decoding="async"
              onLoad={check}
              onError={() => setFailed((list) => [...list, src!])}
              className={cn(
                'meera-float relative h-full w-full object-contain',
                !free && 'meera-framed object-cover',
              )}
            />
          </picture>
        </>
      ) : (
        <div className="relative flex h-full w-full items-end justify-center">
          <span
            role={decorative ? undefined : 'img'}
            aria-label={decorative ? undefined : MEERA_ALT[pose]}
            aria-hidden={decorative || undefined}
            className="glass-photo flex aspect-square w-4/5 items-center justify-center rounded-full text-3xl font-semibold text-text"
          >
            M
          </span>
        </div>
      )}
    </div>
  );
}
