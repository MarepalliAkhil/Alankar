import { useState } from 'react';
import photos from 'virtual:photo-manifest';
import { art, photoFor, type ArtId } from '../../design/art';
import { useTheme } from '../../design/theme-context';
import type { Mode } from '../../design/themes';
import { cn } from '../../lib/cn';

export interface ArtImageProps {
  slot: ArtId;
  className?: string;
  /** Above the fold: load at once. Everything else is lazy-loaded. */
  priority?: boolean;
  /** Force light or dark artwork (previews); normally the current mode. */
  mode?: Mode;
}

/**
 * One image slot: the owner's photo when it is in public/photos, otherwise the generated artwork
 * for the current mode. Width and height are always set (no layout shift); below-the-fold images
 * are lazy-loaded; decorative ones are hidden from screen readers.
 */
export function ArtImage({ slot, className, priority = false, mode: forced }: ArtImageProps) {
  const theme = useTheme();
  const mode = forced ?? theme.mode;
  const entry = art[slot];
  const photo = photoFor(entry, photos);
  const [failed, setFailed] = useState(false);
  const src = photo && !failed ? photo : entry.art[mode];
  return (
    <img
      src={src}
      width={entry.width}
      height={entry.height}
      alt={entry.decorative ? '' : entry.alt}
      aria-hidden={entry.decorative || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      data-art={slot}
      data-source={photo && !failed ? 'photo' : 'art'}
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
