import { useEffect, useRef, useState } from 'react';
import photos from 'virtual:photo-manifest';
import placeholders from 'virtual:photo-placeholders';
import { art, resolveSlot, smallerSources, type ArtId, type Crop } from '../../design/art';
import { cn } from '../../lib/cn';

export interface ArtImageProps {
  slot: ArtId;
  /** Sizing and position of the frame (e.g. "absolute inset-0 h-full w-full"). */
  className?: string;
  /** Above the fold: load at once. Everything else is lazy-loaded. */
  priority?: boolean;
  /** An image the admin set in the content editor; it wins over the photos. */
  override?: string | null;
  /** Lay the theme's readable overlay over the picture (for text or glass placed on top). */
  overlay?: boolean;
  /** Show the photo with this crop instead of the planned one (for a framed header that must
   *  not repeat the background at the same crop). */
  crop?: Crop;
  /** How wide the picture is shown, for choosing the 960 or 1920 px file (default: full width). */
  sizes?: string;
}

/**
 * One image slot, resolved in this order: the admin's image, the slot's own photo in
 * public/photos (webp, jpg, jpeg, png), the owner's photo assigned to the slot with its planned
 * crop and zoom (see design/art.ts), and finally a plain themed gradient (never a drawing). The
 * choice is made from a build-time list, so a missing photo never causes a failed request.
 *
 * The picture always covers its frame with explicit width and height. While a photo loads, a
 * blurred preview shows (the tiny one written by `npm run photos:optimize`) and the photo fades in
 * once decoded. Below-the-fold pictures are lazy-loaded; decorative ones are hidden from screen
 * readers. The crop is two CSS variables on the frame, so no inline style attribute is used.
 */
export function ArtImage({
  slot,
  className,
  priority = false,
  override,
  overlay = false,
  crop: cropOverride,
  sizes = '100vw',
}: ArtImageProps) {
  const entry = art[slot];
  const resolved = override ? null : resolveSlot(entry, photos);
  const photo = override || resolved?.src || null;
  const webp = override ? null : (resolved?.webp ?? null);
  const crop = cropOverride ?? resolved?.crop ?? { position: '50% 50%', zoom: 1 };
  const small = override || !resolved ? null : smallerSources(resolved, photos);
  const [failed, setFailed] = useState<string | null>(null);
  const usePhoto = !!photo && failed !== photo;
  const [loaded, setLoaded] = useState<string | null>(null);
  const frame = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const preview = usePhoto && resolved ? placeholders[resolved.from] || null : null;
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    if (preview) element.style.setProperty('--art-preview', `url("${preview}")`);
    else element.style.removeProperty('--art-preview');
    element.style.setProperty('--art-pos', crop.position);
    element.style.setProperty('--art-zoom', String(crop.zoom));
  }, [preview, crop.position, crop.zoom]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const element = img.current;
    if (photo && element?.complete && element.naturalWidth > 0) setLoaded(photo);
  }, [photo]);

  // The frame is positioned by the caller (absolute, fixed...) or becomes the positioning box.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className ?? '');
  const source = usePhoto ? (override ? 'admin' : 'photo') : 'gradient';
  const image = usePhoto && (
    <img
      ref={img}
      src={photo}
      srcSet={small?.src ? `${small.src} 960w, ${photo} 1920w` : undefined}
      sizes={small?.src ? sizes : undefined}
      width={entry.width}
      height={entry.height}
      alt={entry.decorative ? '' : entry.alt}
      aria-hidden={entry.decorative || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      data-art={slot}
      data-source="photo"
      data-photo={resolved?.from}
      onLoad={() => setLoaded(photo)}
      onError={() => setFailed(photo)}
      className={cn(
        'art-img art-photo absolute inset-0 h-full w-full object-cover',
        loaded === photo && 'is-loaded',
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
          <source
            srcSet={small?.webp ? `${small.webp} 960w, ${webp} 1920w` : webp}
            sizes={small?.webp ? sizes : undefined}
            type="image/webp"
          />
          {image}
        </picture>
      ) : (
        image
      )}
      {overlay && <span aria-hidden="true" className="art-scrim absolute inset-0" />}
    </span>
  );
}
