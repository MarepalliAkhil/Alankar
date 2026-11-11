import './zenotians-type.css';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FolderKanban,
  GitCompareArrows,
  LayoutDashboard,
  ListTree,
  Mail,
  PlayCircle,
  ShieldCheck,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getZenotians } from '../../api/zenotians';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, Drawer, EmptyState, ErrorState } from '../../components/ui';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn } from '../../lib/cn';
import type { ZenotiansContext } from './context';
import { buildMenu, groupMenu, ROOT, type MenuEntry, type SectionId } from './model';
import { ReducedMotionNote } from './ReducedMotionNote';
import { useZenReveal } from './reveal';

/** One small icon per item, from the icon set the app already uses. Decorative. */
const ICONS: Record<SectionId, LucideIcon> = {
  overview: LayoutDashboard,
  about: User,
  'about-zenoti': Building2,
  day: CalendarDays,
  project: FolderKanban,
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

function Icon({ id }: { id: SectionId }) {
  const Glyph = ICONS[id];
  return <Glyph aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />;
}

function Menu({ menu, onNavigate }: { menu: MenuEntry[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inAbout = pathname.startsWith(`${ROOT}/about/`);
  // About me is open only while one of its sub-routes is active. A visitor can fold it away while
  // they stay there; moving to another page resets that.
  const [folded, setFolded] = useState(false);
  useEffect(() => setFolded(false), [pathname]);
  const aboutOpen = inAbout && !folded;

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
                      onClick={() => {
                        if (!inAbout) {
                          navigate(entry.path);
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
                        {entry.children.map((child) => (
                          <li key={child.id} className="min-w-0">
                            <NavLink
                              to={child.path}
                              onClick={onNavigate}
                              className={({ isActive }) =>
                                cn(
                                  subRow,
                                  isActive ? 'bg-primary-soft font-semibold text-text' : rowIdle,
                                )
                              }
                            >
                              <span className="min-w-0 break-words">{child.label}</span>
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <NavLink
                    to={entry.path}
                    end={entry.id === 'overview'}
                    onClick={onNavigate}
                    className={({ isActive }) => cn(row, isActive ? rowActive : rowIdle)}
                  >
                    <Icon id={entry.id} />
                    <span className="min-w-0 break-words">{entry.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function ZenotiansLayout() {
  useDocumentTitle('For Zenotians');
  const query = useQuery({ queryKey: ['zenotians'], queryFn: getZenotians, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  // The element the entrance animation works on (a state, so the hook runs once it exists).
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  useZenReveal(stage, pathname);
  useEffect(() => setOpen(false), [pathname]);

  if (query.isPending) {
    return (
      <PageContainer className="py-lg">
        <div className="grid gap-lg lg:grid-cols-[16rem_1fr]" aria-busy="true">
          <Skeleton className="hidden h-96 lg:block" />
          <Skeleton className="h-96" />
        </div>
      </PageContainer>
    );
  }
  if (query.isError) {
    return (
      <PageContainer className="py-lg">
        <ErrorState
          title="This page did not load"
          description="Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const content = query.data;
  const menu = buildMenu(content);
  if (menu.length === 0) {
    return (
      <PageContainer className="py-lg">
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

  return (
    <div ref={setStage} className="zen-stage zen-type">
      <ReducedMotionNote />
      <PageContainer className="zen-print-area pb-xl pt-md">
        <a
          href="#zen-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
        >
          Skip to this section
        </a>
        <div className="grid gap-lg lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="zen-noprint lg:sticky lg:top-[5.5rem] lg:self-start">
            <div
              data-zen-sidebar
              className="zen-scroll glass-dense hidden overflow-y-auto overflow-x-hidden rounded-card p-3 lg:block lg:max-h-[calc(100dvh-6.5rem)]"
            >
              <Menu menu={menu} />
            </div>
            <div className="lg:hidden">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
              >
                <ListTree className="h-4 w-4" aria-hidden="true" /> Sections
              </Button>
            </div>
            <Drawer open={open} onClose={() => setOpen(false)} title="For Zenotians">
              <div className="zen-type">
                <Menu menu={menu} onNavigate={() => setOpen(false)} />
              </div>
            </Drawer>
          </div>
          <div
            id="zen-content"
            tabIndex={-1}
            className="min-w-0 focus:outline-none [&>div>header:first-child]:mt-0 [&>div>header]:mb-0"
          >
            <Outlet context={{ content, menu } satisfies ZenotiansContext} />
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
