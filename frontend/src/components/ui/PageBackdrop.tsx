import { useEffect, useRef, useState } from 'react';
import type { ArtId } from '../../design/art';
import { ArtImage } from './ArtImage';

/**
 * A full-window picture behind a whole page: the owner's photo (or a plain themed gradient) under
 * a veil in the theme's background colour that keeps ordinary page text AA (the veil is checked
 * against the real photos in design/photo-contrast.test.ts). The photo itself stays sharp: the veil,
 * not blur, keeps text readable; only data-heavy staff pages get a light 4 px blur. On a portrait
 * phone the portrait photo covers the window, or, without one, the landscape photo sits in a short
 * band at the top. Fixed, so it does not scroll; decorative only.
 *
 * When the slot changes (booking switches division) the new picture fades in over the old one,
 * which is dropped once the fade is over.
 */
export function PageBackdrop({ slot, strong = false }: { slot: ArtId; strong?: boolean }) {
  const [leaving, setLeaving] = useState<ArtId | null>(null);
  const previous = useRef<ArtId>(slot);
  useEffect(() => {
    if (previous.current === slot) return;
    setLeaving(previous.current);
    previous.current = slot;
    const timer = window.setTimeout(() => setLeaving(null), 900);
    return () => window.clearTimeout(timer);
  }, [slot]);
  const layers = leaving && leaving !== slot ? [leaving, slot] : [slot];
  return (
    <div
      aria-hidden="true"
      data-page-backdrop={slot}
      data-blur={strong ? 'strong' : 'soft'}
      className="page-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {layers.map((id) => (
        <div key={id} data-backdrop-layer={id} className="page-backdrop-layer absolute inset-0">
          <ArtImage slot={id} priority overlay band className="absolute inset-0 h-full w-full" />
        </div>
      ))}
    </div>
  );
}
