import type { ArtId } from '../../design/art';
import { ArtImage } from './ArtImage';

/**
 * A full-window picture behind a whole page (division pages, staff portals): the owner's photo
 * or the generated artwork, under a strong veil in the theme's background colour so ordinary page
 * text stays readable on top of it. Fixed, so it does not scroll; decorative only.
 */
export function PageBackdrop({ slot }: { slot: ArtId }) {
  return (
    <div aria-hidden="true" className="page-backdrop pointer-events-none fixed inset-0 -z-10">
      <ArtImage slot={slot} priority overlay className="absolute inset-0 h-full w-full" />
    </div>
  );
}
