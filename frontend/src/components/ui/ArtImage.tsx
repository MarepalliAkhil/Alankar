import { useEffect, useRef, useState } from 'react';
import photos from 'virtual:photo-manifest';
import placeholders from 'virtual:photo-placeholders';
import {
  art,
  pictureFor,
  resolveSlot,
  srcSetOf,
  type ArtId,
  type Crop,
  type FormatSets,
} from '../../design/art';
import { PORTRAIT_MOBILE_QUERY } from '../../design/viewport-image';
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
  /** How wide the picture is shown, for choosing among the width variants (default: full width). */
  sizes?: string;
  /**
   * A full-window background: on a portrait phone with no portrait ("-mobile") photo, show the
   * landscape photo in a short band at the top instead of stretching it over a tall window.
   */
  band?: boolean;
}

/**
 * One image slot, resolved in this order: the admin's image, the slot's own photo in
 * public/photos (webp, jpg, jpeg, png), the owner's photo assigned to the slot with its planned
 * crop and zoom (see design/art.ts), and finally a plain themed gradient (never a drawing). The
 * choice is made from a build-time list, so a missing photo never causes a failed request.
 *
 * The picture always covers its frame with explicit width and height. While a photo loads, a
 * blurred preview shows (the tiny one written by `npm run photos:optimize`); when the photo has
 * loaded the sharp one replaces it and the preview is removed (data-loaded), so nothing stays
 * blurred. Below-the-fold pictures are lazy-loaded; decorative ones are hidden from screen
 * readers. The crop is two CSS variables on the frame, so no inline style attribute is used.
 *
 * Width variants (640, 1080, 1600, 2400 px, whichever exist) go into srcset with `sizes`. A
 * portrait photo (`<slot>-mobile`), when one exists, is a <source> with the portrait/mobile media
 * query (screen shape, never the user agent), so a phone downloads only the one that matches.
 */
export function ArtImage({
  slot,
  className,
  priority = false,
  override,
  overlay = false,
  crop: cropOverride,
  sizes = '100vw',
  band = false,
}: ArtImageProps) {
  const entry = art[slot];
  const resolved = override ? null : resolveSlot(entry, photos);
  const picture = override ? null : pictureFor(entry, photos);
  const landscape = picture?.landscape ?? null;
  const portrait = picture?.portrait ?? null;
  const photo = override || landscape?.src || resolved?.src || null;
  const crop = cropOverride ?? resolved?.crop ?? { position: '50% 50%', zoom: 1 };
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
    if (crop.mobilePosition) element.style.setProperty('--art-pos-mobile', crop.mobilePosition);
    else element.style.removeProperty('--art-pos-mobile');
    element.style.setProperty('--art-zoom', String(crop.zoom));
  }, [preview, crop.position, crop.mobilePosition, crop.zoom]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const element = img.current;
    if (photo && element?.complete && element.naturalWidth > 0) setLoaded(photo);
  }, [photo]);

  // The frame is positioned by the caller (absolute, fixed...) or becomes the positioning box.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className ?? '');
  const source = usePhoto ? (override ? 'admin' : 'photo') : 'gradient';
  // Only descriptors with a width need `sizes`; a single file does not.
  const sizesFor = (list: readonly unknown[]) => (list.length > 1 ? sizes : undefined);
  const imgSet = landscape
    ? srcSetOf(landscape.fallback.length ? landscape.fallback : landscape.webp)
    : undefined;
  const imgList = landscape
    ? landscape.fallback.length
      ? landscape.fallback
      : landscape.webp
    : [];
  const image = usePhoto && (
    <img
      ref={img}
      src={photo}
      srcSet={override || imgList.length < 2 ? undefined : imgSet}
      sizes={override ? undefined : sizesFor(imgList)}
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
  const portraitSources = (sets: FormatSets) => (
    <>
      {sets.webp.length > 0 && (
        <source
          media={PORTRAIT_MOBILE_QUERY}
          type="image/webp"
          srcSet={srcSetOf(sets.webp)}
          sizes={sizesFor(sets.webp)}
        />
      )}
      {sets.fallback.length > 0 && (
        <source
          media={PORTRAIT_MOBILE_QUERY}
          srcSet={srcSetOf(sets.fallback)}
          sizes={sizesFor(sets.fallback)}
        />
      )}
    </>
  );
  const fallbackBand = band && !portrait;
  return (
    <span
      ref={frame}
      data-art-frame={slot}
      data-source={source}
      data-loaded={usePhoto && loaded === photo ? 'true' : 'false'}
      data-portrait={portrait ? 'photo' : 'none'}
      data-band={fallbackBand ? 'true' : undefined}
      className={cn('art-frame block overflow-hidden', !positioned && 'relative', className)}
    >
      {usePhoto && landscape && !override ? (
        <picture>
          {portrait && portraitSources(portrait)}
          {landscape.fallback.length > 0 && landscape.webp.length > 0 && (
            <source
              type="image/webp"
              srcSet={srcSetOf(landscape.webp)}
              sizes={sizesFor(landscape.webp)}
            />
          )}
          {image}
        </picture>
      ) : (
        image
      )}
      {overlay && <span aria-hidden="true" className="art-scrim absolute inset-0" />}
    </span>
  );
}
