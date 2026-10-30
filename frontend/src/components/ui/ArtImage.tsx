import { useEffect, useRef, useState } from 'react';
import photos from 'virtual:photo-manifest';
import placeholders from 'virtual:photo-placeholders';
import { art, photoSources, type ArtId } from '../../design/art';
import { useTheme } from '../../design/theme-context';
import type { Mode } from '../../design/themes';
import { cn } from '../../lib/cn';

export interface ArtImageProps {
  slot: ArtId;
  /** Sizing and position of the frame (e.g. "absolute inset-0 h-full w-full"). */
  className?: string;
  /** Above the fold: load at once. Everything else is lazy-loaded. */
  priority?: boolean;
  /** Force light or dark artwork (previews); normally the current mode. */
  mode?: Mode;
  /** An image the admin set in the content editor; it wins over the photo and the artwork. */
  override?: string | null;
  /** Lay the theme's readable overlay over the picture (for text or glass placed on top). */
  overlay?: boolean;
}

/**
 * One image slot, resolved in this order: the admin's image, the owner's photo in
 * public/photos (webp, jpg, jpeg, png), the generated artwork for the current mode. The choice is
 * made from a build-time list, so a missing photo never causes a failed request.
 *
 * The picture always covers its frame, centred, with explicit width and height. While a photo
 * loads, a blurred preview shows (the tiny one written by `npm run photos:optimize`, or the
 * artwork), and the photo fades in once decoded. Below-the-fold pictures are lazy-loaded;
 * decorative ones are hidden from screen readers.
 */
export function ArtImage({
  slot,
  className,
  priority = false,
  mode: forced,
  override,
  overlay = false,
}: ArtImageProps) {
  const theme = useTheme();
  const mode = forced ?? theme.mode;
  const entry = art[slot];
  const found = override ? null : photoSources(entry, photos);
  const photo = override || found?.src || null;
  const webp = override ? null : (found?.webp ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const usePhoto = !!photo && failed !== photo;
  const src = usePhoto ? photo : entry.art[mode];
  const [loaded, setLoaded] = useState<string | null>(null);
  const frame = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);

  // The blurred preview is a CSS variable on the frame (no inline style attribute).
  const preview = usePhoto
    ? (override ? null : placeholders[entry.photo]) || entry.art[mode]
    : null;
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    if (preview) element.style.setProperty('--art-preview', `url("${preview}")`);
    else element.style.removeProperty('--art-preview');
  }, [preview]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const element = img.current;
    if (element?.complete && element.naturalWidth > 0) setLoaded(src);
  }, [src]);

  // The frame is positioned by the caller (absolute, fixed...) or becomes the positioning box.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className ?? '');
  const source = usePhoto ? (override ? 'admin' : 'photo') : 'art';
  const image = (
    <img
      ref={img}
      src={src}
      width={entry.width}
      height={entry.height}
      alt={entry.decorative ? '' : entry.alt}
      aria-hidden={entry.decorative || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      data-art={slot}
      data-source={source === 'art' ? 'art' : 'photo'}
      onLoad={() => setLoaded(src)}
      onError={() => {
        if (usePhoto) setFailed(photo);
      }}
      className={cn(
        'art-img absolute inset-0 h-full w-full object-cover object-center',
        usePhoto && 'art-photo',
        loaded === src && 'is-loaded',
      )}
    />
  );
  return (
    <span
      ref={frame}
      data-art-frame={slot}
      data-source={source}
      className={cn('art-frame block overflow-hidden', !positioned && 'relative', className)}
    >
      {usePhoto && webp ? (
        <picture>
          <source srcSet={webp} type="image/webp" />
          {image}
        </picture>
      ) : (
        image
      )}
      {overlay && <span aria-hidden="true" className="art-scrim absolute inset-0" />}
    </span>
  );
}
