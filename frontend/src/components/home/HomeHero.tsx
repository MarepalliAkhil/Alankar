import { ArrowRight, ChevronDown, Phone } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SiteData } from '../../api/public';
import { brand } from '../../config/brand';
import { divisions, type Division } from '../../config/divisions';
import { ThemeScope } from '../../design/ThemeProvider';
import {
  HERO_THEMES,
  activeStage,
  heroVariables,
  stagePosition,
  stageWeights,
} from '../../design/hero';
import { useTheme } from '../../design/theme-context';
import type { ArtId } from '../../design/art';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { cn } from '../../lib/cn';
import { ArtImage } from '../ui/ArtImage';
import { ButtonLink } from '../ui/ButtonLink';
import { buttonClasses } from '../ui/button-styles';
import { BrandMark } from '../ui/Loader';
import { Skeleton } from '../ui/Skeleton';
import { Reveal } from './Reveal';

/** How much of the hero must still be on screen for the navbar to keep its colours (px). */
const NAV_CLEARANCE = 96;

const HERO_ART: Record<(typeof HERO_THEMES)[number], ArtId> = {
  salon: 'salonHero',
  spa: 'spaHero',
  parlor: 'parlorHero',
};

/** Classes per stage, written out so Tailwind keeps them (no class names built from strings). */
const LAYER = ['hero-layer-0', 'hero-layer-1', 'hero-layer-2'] as const;
const PANEL = ['hero-panel-0', 'hero-panel-1', 'hero-panel-2'] as const;

export interface HomeHeroProps {
  site: SiteData | undefined;
  loading: boolean;
  /** Where "Book Now" goes for this visitor; null for staff (they get their dashboard). */
  book: string;
  staffHome: string | null;
  tel: string | undefined;
}

/**
 * Task 11b: the home hero.
 *
 * On screens 768 px and wider (and when the visitor has not asked for reduced motion) it is a
 * scroll-driven stage: while you scroll through it, the page holds still and the hero moves
 * through Salon, Spa and Beauty Parlor. The background artwork cross-fades, the theme colours
 * blend (design/hero.ts), and the three division panels turn on a 3D drum (CSS transforms only).
 *
 * On phones and with reduced motion it becomes stacked sections in each division's theme, which
 * fade in as they scroll into view (no fade with reduced motion).
 */
export function HomeHero(props: HomeHeroProps) {
  const wide = useMediaQuery('(min-width: 768px)');
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  return wide && !calm ? <ScrollStage {...props} /> : <StackedStage {...props} />;
}

function Intro({
  site,
  loading,
  book,
  staffHome,
  tel,
  stage,
}: HomeHeroProps & { stage: Division | null }) {
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary-hover">
        {brand.shopTagline}
      </p>
      <h1 id="hero-title" className="text-4xl font-semibold text-text">
        {brand.shopName}
      </h1>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          {site?.hero?.headline && (
            <p className="text-2xl font-semibold text-text">{site.hero.headline}</p>
          )}
          <p className="max-w-xl text-lg text-text-muted">
            {site?.hero?.subtitle ??
              'Book your visit online. Send a request, we confirm your stylist and time, and you pay securely with the link we send you.'}
          </p>
        </>
      )}
      <div className="mt-sm flex flex-wrap items-center gap-sm">
        {staffHome ? (
          <ButtonLink to={staffHome} size="lg">
            Go to dashboard
          </ButtonLink>
        ) : (
          <ButtonLink to={book} size="lg">
            Book Now
          </ButtonLink>
        )}
        <ButtonLink to={stage?.path ?? '/salon'} variant="secondary" size="lg">
          {stage ? `Explore ${stage.label}` : 'Explore services'}
        </ButtonLink>
        {tel && (
          <a
            href={`tel:${tel}`}
            className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
          >
            <Phone aria-hidden="true" className="h-4 w-4" /> Call salon
          </a>
        )}
      </div>
    </div>
  );
}

function DivisionPanel({
  division,
  count,
  hidden = false,
  headingLevel: Heading = 'h2',
}: {
  division: Division;
  count: number | undefined;
  hidden?: boolean;
  headingLevel?: 'h2' | 'h3';
}) {
  const theme = HERO_THEMES[divisions.indexOf(division)];
  return (
    <>
      <BrandMark theme={theme} className="mark-still h-16 w-16" />
      <Heading className="text-2xl font-semibold text-text">{division.label}</Heading>
      <p className="text-base text-text-muted">{division.summary}</p>
      {count !== undefined && (
        <p className="text-sm font-medium text-text">
          {count} {count === 1 ? 'service' : 'services'} with prices including GST
        </p>
      )}
      <Link
        to={division.path}
        tabIndex={hidden ? -1 : undefined}
        className={cn(buttonClasses('secondary', 'sm'), 'mt-auto self-start')}
      >
        See {division.label} services <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </>
  );
}

function ScrollStage(props: HomeHeroProps) {
  const track = useRef<HTMLElement>(null);
  const { mode } = useTheme();
  const [stage, setStage] = useState(0);
  const last = useRef({ position: -1, mode, progress: 0, follow: true });

  const apply = useCallback(
    (progress: number, rect?: DOMRect) => {
      const element = track.current;
      if (!element) return;
      const position = stagePosition(progress);
      // The fixed navbar takes the hero's colours while the hero is behind it.
      const follow = rect ? rect.bottom > NAV_CLEARANCE : last.current.follow;
      const changed =
        position !== last.current.position ||
        mode !== last.current.mode ||
        follow !== last.current.follow;
      last.current = { position, mode, progress, follow };
      if (!changed) return;
      const header = document.querySelector<HTMLElement>('[data-hero-follow]');
      const vars = heroVariables(position, mode);
      for (const [name, value] of Object.entries(vars)) {
        element.style.setProperty(name, value);
        if (header) {
          if (follow) header.style.setProperty(name, value);
          else header.style.removeProperty(name);
        }
      }
      element.style.setProperty('--hero-pos', position.toFixed(4));
      stageWeights(position).forEach((weight, i) =>
        element.style.setProperty(`--hero-w${i}`, weight.toFixed(4)),
      );
      setStage(activeStage(position));
    },
    [mode],
  );

  // First paint already in the Salon theme, and again whenever dark/light changes.
  useLayoutEffect(() => apply(last.current.progress), [apply]);
  useScrollProgress(track, apply);
  // Leaving the home page hands the navbar back to the page theme.
  useEffect(
    () => () => {
      last.current.position = -1; // so a remount (e.g. React's dev double-mount) paints again
      const header = document.querySelector<HTMLElement>('[data-hero-follow]');
      if (!header) return;
      for (const name of Object.keys(heroVariables(0, 'light'))) header.style.removeProperty(name);
    },
    [],
  );

  const goTo = (index: number) => {
    const element = track.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY;
    const distance = element.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (distance * index) / (divisions.length - 1), behavior: 'smooth' });
  };
  const counts = props.site?.stats?.divisions;

  return (
    <section
      ref={track}
      aria-labelledby="hero-title"
      data-hero="scroll"
      className="hero-track relative text-text"
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {HERO_THEMES.map((theme, i) => (
          <div
            key={theme}
            aria-hidden="true"
            className={cn('hero-layer absolute inset-0', LAYER[i])}
          >
            <ArtImage
              slot={HERO_ART[theme]}
              priority={i === 0}
              override={i === 0 ? props.site?.hero?.image_url : null}
              overlay
              className="h-full w-full"
            />
          </div>
        ))}

        <div className="relative mx-auto grid h-full w-full max-w-7xl grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-xl px-lg pt-24 pb-xl">
          <div className="hero-intro glass-dense rounded-modal p-xl">
            <Intro {...props} stage={divisions[stage]} />
          </div>

          <div className="hero-scene" role="group" aria-label="Our three divisions">
            <div className="hero-ring">
              {divisions.map((division, i) => (
                <article
                  key={division.id}
                  aria-hidden={i !== stage || undefined}
                  aria-label={division.label}
                  className={cn(
                    'hero-panel glass-dense flex flex-col gap-sm rounded-modal p-xl',
                    PANEL[i],
                  )}
                >
                  <DivisionPanel
                    division={division}
                    count={counts?.[division.id]}
                    hidden={i !== stage}
                  />
                </article>
              ))}
            </div>
          </div>
        </div>

        <nav
          aria-label="Hero stages"
          className="absolute right-md top-1/2 flex -translate-y-1/2 flex-col gap-sm lg:right-lg"
        >
          {divisions.map((division, i) => (
            <button
              key={division.id}
              type="button"
              aria-label={`Show ${division.label}`}
              aria-current={i === stage ? 'step' : undefined}
              onClick={() => goTo(i)}
              className={cn(
                'h-3 w-3 rounded-full border border-primary transition-transform duration-base ease-brand focus-visible:shadow-focus focus-visible:outline-none',
                i === stage ? 'scale-125 bg-primary' : 'bg-surface',
              )}
            />
          ))}
        </nav>

        <p
          aria-hidden="true"
          className={cn(
            'hero-hint glass-dense absolute bottom-xl left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-md py-xs text-sm font-medium text-text',
            stage === divisions.length - 1 && 'opacity-0',
          )}
        >
          Scroll to explore <ChevronDown className="h-4 w-4" />
        </p>
      </div>
    </section>
  );
}

function Band({
  theme,
  priority,
  override,
  className,
  children,
}: {
  theme: (typeof HERO_THEMES)[number];
  priority?: boolean;
  override?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ThemeScope
      theme={theme}
      className={cn('relative overflow-hidden bg-background text-text', className)}
    >
      <ArtImage
        slot={HERO_ART[theme]}
        priority={priority}
        override={override}
        overlay
        className="absolute inset-0 h-full w-full"
      />
      <div className="relative mx-auto w-full max-w-7xl px-md py-xl sm:px-lg">{children}</div>
    </ThemeScope>
  );
}

function StackedStage(props: HomeHeroProps) {
  const counts = props.site?.stats?.divisions;
  return (
    <section aria-labelledby="hero-title" data-hero="stacked">
      <Band
        theme="salon"
        priority
        override={props.site?.hero?.image_url}
        className="flex min-h-[70svh] items-center"
      >
        <div className="glass-dense rounded-modal p-lg sm:p-xl">
          <Intro {...props} stage={null} />
        </div>
      </Band>
      {divisions.map((division, i) => (
        <Band key={division.id} theme={HERO_THEMES[i]}>
          <Reveal
            as="article"
            aria-label={division.label}
            className="glass-dense flex max-w-xl flex-col gap-sm rounded-modal p-lg"
          >
            <DivisionPanel division={division} count={counts?.[division.id]} />
          </Reveal>
        </Band>
      ))}
    </section>
  );
}
