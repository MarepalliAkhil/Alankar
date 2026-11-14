import './zenotians-type.css';
import { useQuery } from '@tanstack/react-query';
import {
  BrainCircuit,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  GitCompareArrows,
  Headset,
  LayoutDashboard,
  ListTree,
  Mail,
  PlayCircle,
  ShieldCheck,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getZenotians } from '../../api/zenotians';
import { HeadingLevel } from '../../components/layout/heading-level';
import { PageContainer } from '../../components/layout/PageContainer';
import { Drawer, EmptyState, ErrorState } from '../../components/ui';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { usePageHead } from '../../seo/head';
import { AiIntelligenceSection, AirSection } from './AiSections';
import { ZenotiansData } from './context';
import {
  aboutDomId,
  buildMenu,
  groupMenu,
  ROOT,
  sectionDomId,
  targetForPath,
  type AboutId,
  type MenuEntry,
  type SectionId,
} from './model';
import { ReducedMotionNote } from './ReducedMotionNote';
import { reducedMotion, useZenReveal } from './reveal';

// Each section's code is its own file, loaded when the page opens (diagrams load later still).
const Overview = lazy(() => import('./OverviewPage'));
const About = lazy(() => import('./AboutPage'));
const Day = lazy(() => import('./StoryPage'));
const named = <K extends string>(key: K) =>
  lazy(() =>
    import('./ContentPages').then((m) => ({ default: m[key as never] as () => JSX.Element })),
  );
const AboutZenoti = named('AboutZenotiPage');
const Project = named('ProjectPage');
const Mapping = named('MappingPage');
const Quality = named('QualityPage');
const Security = named('SecurityPage');
const Limitations = named('LimitationsPage');
const Demo = named('DemoPage');
const Contact = named('ContactPage');

const BODY: Record<Exclude<SectionId, 'about'>, () => JSX.Element> = {
  overview: () => <Overview />,
  'about-zenoti': () => <AboutZenoti />,
  day: () => <Day />,
  project: () => <Project />,
  air: () => <AirSection />,
  'ai-intelligence': () => <AiIntelligenceSection />,
  mapping: () => <Mapping />,
  quality: () => <Quality />,
  security: () => <Security />,
  limitations: () => <Limitations />,
  demo: () => <Demo />,
  contact: () => <Contact />,
};

/** One small icon per item, from the icon set the app already uses. Decorative. */
const ICONS: Record<SectionId, LucideIcon> = {
  overview: LayoutDashboard,
  about: User,
  'about-zenoti': Building2,
  day: CalendarDays,
  project: FolderKanban,
  air: Headset,
  'ai-intelligence': BrainCircuit,
  mapping: GitCompareArrows,
  quality: ClipboardCheck,
  security: ShieldCheck,
  limitations: TriangleAlert,
  demo: PlayCircle,
  contact: Mail,
};

// A row: at least 44 px high, 10 to 14 px padding, 12 px corners, normal letter-spacing, weight 500
// (600 when active). The label wraps to a second line instead of touching the edge.
const row =
  'relative flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-left text-base font-medium leading-snug tracking-normal transition-colors hover:bg-primary-soft hover:text-text focus-visible:bg-primary-soft focus-visible:text-text focus-visible:shadow-focus focus-visible:outline-none';
const rowIdle = 'text-text-muted';
// Active: a soft accent fill and a thin accent bar on the left edge.
const rowActive =
  'bg-primary-soft font-semibold text-text before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-primary';
const subRow =
  'relative flex min-h-[38px] w-full min-w-0 items-center rounded-[10px] px-3 py-1.5 text-[15px] font-medium leading-snug tracking-normal transition-colors hover:bg-primary-soft hover:text-text focus-visible:bg-primary-soft focus-visible:text-text focus-visible:shadow-focus focus-visible:outline-none';

interface Target {
  section: SectionId;
  item?: AboutId;
}

function Icon({ id }: { id: SectionId }) {
  const Glyph = ICONS[id];
  return <Glyph aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />;
}

/** The address of a place on the page (shared, and kept in the address bar while scrolling). */
function pathOf(menu: MenuEntry[], target: Target): string {
  const entry = menu.find((e) => e.id === target.section);
  if (!entry) return ROOT;
  if (target.item) return entry.children?.find((c) => c.id === target.item)?.path ?? entry.path;
  return entry.id === 'about' ? (entry.children?.[0]?.path ?? entry.path) : entry.path;
}

function Menu({
  menu,
  active,
  go,
  onNavigate,
}: {
  menu: MenuEntry[];
  active: Target;
  go: (target: Target) => void;
  onNavigate?: () => void;
}) {
  // About me stays open while one of its items is the current place; a visitor can fold it.
  const inAbout = active.section === 'about';
  const [folded, setFolded] = useState(false);
  useEffect(() => setFolded(false), [inAbout]);
  const aboutOpen = inAbout && !folded;
  const click = (target: Target) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate?.();
    go(target);
  };

  return (
    <nav aria-label="For Zenotians sections" className="min-w-0">
      {groupMenu(menu).map((group) => (
        <div key={group.id} className={cn('min-w-0', group.heading ? 'mt-4' : 'mt-1 first:mt-0')}>
          {group.heading && (
            <p
              id={`zen-group-${group.id}`}
              className="px-3.5 pb-1 text-sm font-medium leading-snug tracking-normal text-text-muted"
            >
              {group.heading}
            </p>
          )}
          <ul
            className="flex flex-col gap-0.5"
            aria-labelledby={group.heading ? `zen-group-${group.id}` : undefined}
          >
            {group.entries.map((entry) => (
              <li key={entry.id} className="min-w-0">
                {entry.children ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={aboutOpen}
                      aria-controls={aboutOpen ? 'zen-about-menu' : undefined}
                      aria-current={inAbout ? 'location' : undefined}
                      onClick={() => {
                        if (!inAbout) {
                          onNavigate?.();
                          go({ section: 'about', item: entry.children?.[0]?.id });
                          return;
                        }
                        setFolded((was) => !was);
                      }}
                      className={cn(row, 'justify-between', inAbout ? 'text-text' : rowIdle)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon id={entry.id} />
                        <span className="min-w-0 break-words">{entry.label}</span>
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform',
                          aboutOpen && 'rotate-180',
                        )}
                      />
                    </button>
                    {aboutOpen && (
                      <ul
                        id="zen-about-menu"
                        className="ml-[1.375rem] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2.5"
                      >
                        {entry.children.map((child) => {
                          const current = active.item === child.id;
                          return (
                            <li key={child.id} className="min-w-0">
                              <a
                                href={child.path}
                                aria-current={current ? 'location' : undefined}
                                onClick={click({ section: 'about', item: child.id })}
                                className={cn(
                                  subRow,
                                  current ? 'bg-primary-soft font-semibold text-text' : rowIdle,
                                )}
                              >
                                <span className="min-w-0 break-words">{child.label}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <a
                    href={entry.path}
                    aria-current={active.section === entry.id ? 'location' : undefined}
                    onClick={click({ section: entry.id })}
                    className={cn(row, active.section === entry.id ? rowActive : rowIdle)}
                  >
                    <Icon id={entry.id} />
                    <span className="min-w-0 break-words">{entry.label}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop: the home page's dot list, one dot per section, on the right edge. */
function SectionDots({
  menu,
  active,
  go,
}: {
  menu: MenuEntry[];
  active: Target;
  go: (target: Target) => void;
}) {
  return (
    <nav
      aria-label="Section indicator"
      data-zen-dots
      className="zen-noprint glass-photo fixed right-sm top-1/2 z-20 hidden -translate-y-1/2 rounded-card px-sm py-md xl:block"
    >
      <ol className="flex flex-col gap-sm">
        {menu.map((entry) => {
          const current = active.section === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={current ? 'location' : undefined}
                aria-label={entry.label}
                title={entry.label}
                onClick={() => go({ section: entry.id })}
                className="flex min-h-8 min-w-8 items-center justify-center rounded-full focus-visible:shadow-focus focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  data-dot={current ? 'active' : 'idle'}
                  className={cn(
                    'block h-3 w-3 shrink-0 rounded-full border-2 border-primary transition-transform duration-base',
                    current ? 'scale-125 bg-primary' : 'bg-transparent',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Phones and tablets: a slim bar under the navbar with the current section and Previous / Next. */
function SectionBar({
  menu,
  index,
  go,
  onOpenMenu,
  menuOpen,
}: {
  menu: MenuEntry[];
  index: number;
  go: (target: Target) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const current = menu[index];
  const previous = menu[index - 1];
  const next = menu[index + 1];
  return (
    <div
      data-zen-bar
      className="zen-noprint glass-bar sticky top-[var(--nav-total)] z-30 mx-md mt-sm flex min-h-14 items-center gap-1 rounded-card px-1 lg:hidden"
    >
      <button
        type="button"
        onClick={() => previous && go({ section: previous.id })}
        disabled={!previous}
        aria-label={previous ? `Previous: ${previous.label}` : 'Previous section'}
        className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-40"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={`Sections: ${current?.label ?? ''}, ${index + 1} of ${menu.length}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-2 text-center focus-visible:shadow-focus focus-visible:outline-none"
      >
        <ListTree aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="min-w-0 truncate text-sm font-semibold text-text" aria-live="polite">
          {current?.label}
        </span>
        <span className="shrink-0 text-sm text-text-muted">
          {index + 1} of {menu.length}
        </span>
      </button>
      <button
        type="button"
        onClick={() => next && go({ section: next.id })}
        disabled={!next}
        aria-label={next ? `Next: ${next.label}` : 'Next section'}
        className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-40"
      >
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );
}

function Section({
  entry,
  next,
  go,
  children,
}: {
  entry: MenuEntry;
  next?: MenuEntry;
  go: (target: Target) => void;
  children: ReactNode;
}) {
  return (
    <section
      id={sectionDomId(entry.id)}
      data-zen-section={entry.id}
      aria-label={entry.label}
      className="zen-section"
    >
      <Suspense
        fallback={
          <div aria-busy="true">
            <Skeleton className="h-96" />
          </div>
        }
      >
        {children}
      </Suspense>
      {next && (
        <p className="zen-noprint mt-xl">
          <a
            href={next.path}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              go({ section: next.id });
            }}
            className="touch-target inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-md text-base font-semibold text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
          >
            Next: {next.label}
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </p>
      )}
    </section>
  );
}

/**
 * For Zenotians as ONE continuous page: every section stacked in menu order, each starting at a
 * full-screen boundary with gentle (proximity) scroll snap. The side menu, the dot list and the
 * phone bar follow the section on screen; the address bar follows too (history.replaceState, no
 * new history entries), and an old section address opens the page at that section.
 */
export default function ZenotiansLayout() {
  usePageHead(ROOT);
  const query = useQuery({ queryKey: ['zenotians'], queryFn: getZenotians, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  // The element the entrance animation works on (a state, so the hook runs once it exists).
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const location = useLocation();
  useZenReveal(stage, ROOT);

  const content = query.data;
  const menu = useMemo(() => (content ? buildMenu(content) : []), [content]);
  const [active, setActive] = useState<Target>({ section: 'overview' });
  const lastPath = useRef('');

  const remember = useCallback(
    (target: Target) => {
      setActive((was) =>
        was.section === target.section && was.item === target.item ? was : target,
      );
      const path = pathOf(menu, target);
      if (path !== lastPath.current && window.location.pathname !== path) {
        // Replace, never push: scrolling must not fill the Back button's history.
        window.history.replaceState(window.history.state, '', `${path}${window.location.search}`);
      }
      lastPath.current = path;
    },
    [menu],
  );

  /** Scrolls to a section (or an About me item), moves focus to its heading, updates the URL. */
  const go = useCallback(
    (target: Target, instant = false) => {
      const element = document.getElementById(
        target.item ? aboutDomId(target.item) : sectionDomId(target.section),
      );
      if (!element) return;
      element.scrollIntoView?.({
        behavior: instant || reducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      const heading = element.querySelector<HTMLElement>('h1, h2, h3');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      remember(target);
    },
    [remember],
  );

  // Opening an address (or following a link to one) goes to that section.
  useEffect(() => {
    if (menu.length === 0) return;
    const target = targetForPath(menu, location.pathname);
    if (!target) {
      if (location.pathname.replace(/\/+$/, '') !== ROOT) remember({ section: menu[0]!.id });
      return;
    }
    if (location.hash) {
      setActive(target);
      return; // the section scrolls to the named item itself (for example a limitation)
    }
    if (target.section === menu[0]!.id && !target.item) {
      setActive(target);
      return;
    }
    // The menu shows the place at once; the scroll waits one frame for the sections to draw.
    setActive(target);
    const frame = window.requestAnimationFrame(() => go(target, true));
    return () => window.cancelAnimationFrame(frame);
  }, [menu, location.pathname, location.hash, location.key, go, remember]);

  // The section on screen becomes the current one (a thin line 35% from the top decides).
  useEffect(() => {
    if (!stage || menu.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const item = el.dataset.zenAbout as AboutId | undefined;
          const section = (el.dataset.zenSection ?? (item ? 'about' : undefined)) as
            SectionId | undefined;
          if (section) remember(item ? { section: 'about', item } : { section });
        }
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    stage
      .querySelectorAll('[data-zen-section]:not([data-zen-section="about"]), [data-zen-about]')
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [stage, menu, remember]);

  // Gentle snap to section starts on this page only (never with reduced motion: CSS).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('zen-snap');
    return () => root.classList.remove('zen-snap');
  }, []);

  const index = Math.max(
    0,
    menu.findIndex((e) => e.id === active.section),
  );

  // Page Down / Page Up move between sections (not while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'PageDown' && event.key !== 'PageUp') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const t = event.target;
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      )
        return;
      const nextIndex = index + (event.key === 'PageDown' ? 1 : -1);
      const target = menu[nextIndex];
      if (!target) return;
      event.preventDefault();
      go({ section: target.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, menu, go]);

  useEffect(() => setOpen(false), [active.section]);

  if (query.isPending) {
    return (
      <PageContainer className="py-lg">
        <h1 className="sr-only">For Zenotians</h1>
        <div className="grid gap-lg lg:grid-cols-[16rem_1fr]" aria-busy="true">
          <Skeleton className="hidden h-96 lg:block" />
          <Skeleton className="h-96" />
        </div>
      </PageContainer>
    );
  }
  if (query.isError || !content) {
    return (
      <PageContainer className="py-lg">
        <h1 className="sr-only">For Zenotians</h1>
        <ErrorState
          title="This page did not load"
          description="Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  if (menu.length === 0) {
    return (
      <PageContainer className="py-lg">
        <h1 className="sr-only">For Zenotians</h1>
        <EmptyState
          title="This page is not published"
          description="There is nothing to show here right now."
          action={
            <Link to="/" className="text-primary-hover underline">
              Back to home
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const hasOverview = menu.some((e) => e.id === 'overview');
  return (
    <ZenotiansData.Provider
      value={{ content, menu, goTo: (section: SectionId) => go({ section }) }}
    >
      <div ref={setStage} className="zen-stage zen-type" data-zen-page>
        <ReducedMotionNote />
        {/* The page's one H1 is the overview headline; without an overview, this one. */}
        {!hasOverview && <h1 className="sr-only">For Zenotians</h1>}
        <SectionBar
          menu={menu}
          index={index}
          go={go}
          onOpenMenu={() => setOpen(true)}
          menuOpen={open}
        />
        <PageContainer className="zen-print-area pb-xl pt-md">
          <a
            href="#zen-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
          >
            Skip to the sections
          </a>
          <div className="grid gap-lg lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="zen-noprint hidden lg:sticky lg:top-[5.5rem] lg:block lg:self-start">
              <div
                data-zen-sidebar
                className="zen-scroll glass-dense overflow-y-auto overflow-x-hidden rounded-card p-3 lg:max-h-[calc(100dvh-6.5rem)]"
              >
                <Menu menu={menu} active={active} go={go} />
              </div>
            </div>
            <Drawer open={open} onClose={() => setOpen(false)} title="For Zenotians">
              <div className="zen-type">
                <Menu menu={menu} active={active} go={go} onNavigate={() => setOpen(false)} />
              </div>
            </Drawer>
            <div id="zen-content" tabIndex={-1} className="min-w-0 focus:outline-none">
              {menu.map((entry, i) => (
                <Section key={entry.id} entry={entry} next={menu[i + 1]} go={go}>
                  {entry.id === 'about' ? (
                    <HeadingLevel.Provider value={{ level: 3, breadcrumbs: false }}>
                      <h2 className="mb-md font-display text-3xl text-text">{entry.label}</h2>
                      <div className="flex flex-col gap-2xl">
                        {(entry.children ?? []).map((child) => (
                          <div key={child.id} id={aboutDomId(child.id)} data-zen-about={child.id}>
                            <About id={child.id} />
                          </div>
                        ))}
                      </div>
                    </HeadingLevel.Provider>
                  ) : (
                    <HeadingLevel.Provider value={{ level: 2, breadcrumbs: false }}>
                      {BODY[entry.id]()}
                    </HeadingLevel.Provider>
                  )}
                </Section>
              ))}
            </div>
          </div>
        </PageContainer>
        <SectionDots menu={menu} active={active} go={go} />
      </div>
    </ZenotiansData.Provider>
  );
}
