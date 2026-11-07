import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DivisionId } from '../../config/divisions';
import type { ArtId } from '../../design/art';
import focus from '../../design/photo-focus.json';
import type { ThemeName } from '../../design/themes';
import { PageContainer } from '../layout/PageContainer';
import { ArtImage, ButtonLink } from '../ui';

const HERO: Record<DivisionId, ArtId> = {
  salon: 'salonHero',
  spa: 'spaHero',
  'beauty-parlor': 'parlorHero',
};
const FOCUS_KEY: Record<DivisionId, keyof typeof focus.focus> = {
  salon: 'salon-hero',
  spa: 'spa-hero',
  'beauty-parlor': 'parlor-hero',
};

export interface HeroCategory {
  slug: string;
  name: string;
}

export interface DivisionHeroProps {
  id: DivisionId;
  theme: ThemeName;
  label: string;
  summary: string;
  /** "9 services in 3 categories · Every price includes GST." */
  facts: ReactNode;
  book: string | null;
  tel: string | undefined;
  /** The division's real categories (from the catalogue); shown as chips when there are any. */
  categories?: readonly HeroCategory[];
  /** A chip was pressed: the page filters to that category and scrolls to the services. */
  onPickCategory?: (slug: string) => void;
}

/**
 * The opening of Salon, Spa and Parlor: ONE hero for all three, with ONE picture (the division's
 * hero photo, full width, never repeated as a framed copy or a blurred backdrop).
 *
 * Wide screens: the photo fills the hero (height clamp(520px, 78dvh, 760px), content centred, no
 * dead area) and a transparent glass card sits on the left (about 60% wide on tablets, 46% on
 * desktop) over a directional scrim that exists on the left only. Phones: a top band of the photo
 * (about 40dvh, roughly 4:3) with the card overlapping its lower edge, 16 px gutters and the safe
 * areas respected; the page below takes the division's tint. The crop of each photo (desktop and
 * phone) lives in design/photo-focus.json. The chips are the real categories of the division.
 */
export function DivisionHero(props: DivisionHeroProps) {
  const { id, label, summary, facts, book, tel, categories = [], onPickCategory } = props;
  const key = FOCUS_KEY[id];
  const crop = {
    position: focus.focus[key].desktop,
    mobilePosition: focus.focus[key].mobile,
    zoom: 1,
  };
  return (
    <header data-division-hero={id} className="division-hero">
      <div className="division-hero__photo">
        <ArtImage
          slot={HERO[id]}
          priority
          crop={crop}
          sizes="100vw"
          className="absolute inset-0 h-full w-full"
        />
        <span aria-hidden="true" className="division-hero__scrim" />
      </div>
      <PageContainer className="division-hero__content">
        <div className="hero-glass division-hero__card">
          <h1 className="division-hero__title">{label}</h1>
          <p className="division-hero__summary">{summary}</p>
          <p className="division-hero__facts">{facts}</p>
          <div className="flex flex-wrap items-center gap-sm">
            {book && (
              <ButtonLink to={book} className="min-h-11">
                Book now
              </ButtonLink>
            )}
            {tel && (
              <a href={`tel:${tel}`} className="hero-ghost">
                <Phone aria-hidden="true" className="h-4 w-4" /> Call the salon
              </a>
            )}
          </div>
          {categories.length > 0 && (
            <nav aria-label={`${label} categories`} className="division-hero__chips">
              <ul className="flex flex-wrap gap-2">
                {categories.slice(0, 8).map((category) => (
                  <li key={category.slug}>
                    <button
                      type="button"
                      className="hero-chip"
                      onClick={() => onPickCategory?.(category.slug)}
                    >
                      {category.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </PageContainer>
    </header>
  );
}
