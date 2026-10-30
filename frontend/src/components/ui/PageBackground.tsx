import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { DivisionId } from '../../config/divisions';
import type { ArtId } from '../../design/art';
import { useRouteTheme } from '../../design/display';
import { stageWeights } from '../../design/hero';
import { divisionOfPath, readLastDivision, rememberDivision } from '../../design/last-division';
import { divisionTheme } from '../../design/themes';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ArtImage } from './ArtImage';
import { PageBackdrop } from './PageBackdrop';

const SLOT: Record<DivisionId, ArtId> = {
  salon: 'salonBackground',
  spa: 'spaBackground',
  'beauty-parlor': 'parlorBackground',
};
const HOME_SLOTS: ArtId[] = ['salonBackground', 'spaBackground', 'parlorBackground'];
const LAYER = ['bg-layer-0', 'bg-layer-1', 'bg-layer-2'] as const;

/** Home page, below the hero: the three backgrounds cross-fade as the visitor scrolls. */
function HomeBackground() {
  const root = useRef<HTMLDivElement>(null);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      const start = hero ? hero.offsetTop + hero.offsetHeight - window.innerHeight : 0;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        end > start ? Math.min(1, Math.max(0, (window.scrollY - start) / (end - start))) : 0;
      // Reduced motion: switch instantly between the three backgrounds, no cross-fade.
      const position = calm ? Math.round(progress * 2) : progress * 2;
      stageWeights(position).forEach((weight, i) =>
        element.style.setProperty(`--bg-w${i}`, weight.toFixed(3)),
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [calm]);
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="page-backdrop pointer-events-none fixed inset-0 -z-10"
    >
      {HOME_SLOTS.map((slot, i) => (
        <div key={slot} className={`bg-layer absolute inset-0 ${LAYER[i]}`}>
          <ArtImage
            slot={slot}
            priority={i === 0}
            overlay
            className="absolute inset-0 h-full w-full"
          />
        </div>
      ))}
    </div>
  );
}

/** Every page that is not a division page or the home page wears the last-viewed division. */
function LastDivision({ division }: { division: DivisionId }) {
  useRouteTheme(divisionTheme[division]);
  return <PageBackdrop key={division} slot={SLOT[division]} />;
}

/**
 * The one shared page background, rendered by every layout (task: backgrounds on every page).
 * Fixed behind all content, under a readability overlay; the picture comes from the photo-slot
 * helper (generated artwork when there is no photo). Which picture:
 * home -> cross-fade of the three backgrounds; /salon, /spa, /beauty-parlor -> that division's;
 * anything else -> the division the visitor viewed last (kept per browser, default spa).
 * `fixed` overrides all of this (staff portals always use the shop background).
 */
export function PageBackground({ fixed }: { fixed?: ArtId }) {
  const { pathname } = useLocation();
  const viewing = divisionOfPath(pathname);
  useEffect(() => {
    if (viewing) rememberDivision(viewing);
  }, [viewing]);
  if (fixed) return <PageBackdrop slot={fixed} />;
  if (pathname === '/') return <HomeBackground />;
  // A division page sets its own theme (DivisionPage); other pages borrow the last division's.
  if (viewing) return <PageBackdrop key={viewing} slot={SLOT[viewing]} />;
  return <LastDivision division={readLastDivision()} />;
}
