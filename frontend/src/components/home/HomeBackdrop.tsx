import { useEffect, useRef, useState } from 'react';
import { HOME_CHAPTERS, type HomeChapter } from '../../design/art';
import { ThemeScope } from '../../design/ThemeProvider';
import { cn } from '../../lib/cn';
import { ArtImage } from '../ui/ArtImage';
import { HOME_BACKGROUNDS } from './home-backgrounds';

/**
 * ONE full-viewport background for the whole home page story. It is sticky inside its zone (so it
 * scrolls away with the zone and never covers the rest of the page), takes no space in the layout,
 * and crossfades between the four pictures as you scroll (Alankar reception, Salon, Spa, Parlor),
 * with a slow zoom (CSS only) and a tint in that division's theme colour.
 *
 * Only the current and the next picture are mounted, so the browser loads at most two; the one
 * just left stays for the length of the fade. Each picture is an image slot (the admin's image for
 * the first one, then public/photos, then a plain themed gradient), decorative, loaded with the
 * blurred preview and the 960 px / 1920 px sizes of ArtImage. With reduced motion there is no zoom
 * and the fades are short.
 */
export function HomeBackdrop({
  chapter,
  firstImage,
}: {
  chapter: HomeChapter;
  /** An image the admin set for the first section in the content editor. */
  firstImage?: string | null;
}) {
  const [leaving, setLeaving] = useState<HomeChapter | null>(null);
  const previous = useRef<HomeChapter>(chapter);
  useEffect(() => {
    if (previous.current === chapter) return;
    setLeaving(previous.current);
    previous.current = chapter;
    const timer = window.setTimeout(() => setLeaving(null), 1200);
    return () => window.clearTimeout(timer);
  }, [chapter]);

  const next = Math.min(4, chapter + 1) as HomeChapter;
  const mounted = HOME_CHAPTERS.filter((n) => n === chapter || n === next || n === leaving);
  return (
    <div
      aria-hidden="true"
      data-home-backdrop
      data-chapter={chapter}
      className="home-backdrop pointer-events-none sticky top-0 z-0 -mb-[100svh] h-[100svh] w-full overflow-hidden"
    >
      {mounted.map((n) => (
        <div
          key={n}
          data-home-layer={n}
          data-current={n === chapter}
          className={cn('home-layer absolute inset-0', n === chapter && 'is-current')}
        >
          <div className="home-zoom absolute inset-0">
            <ArtImage
              slot={HOME_BACKGROUNDS[n].slot}
              priority={n === chapter}
              override={n === 1 ? firstImage : null}
              overlay
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <ThemeScope theme={HOME_BACKGROUNDS[n].theme} className="absolute inset-0">
            <span className="home-tint absolute inset-0 block" />
          </ThemeScope>
        </div>
      ))}
    </div>
  );
}
