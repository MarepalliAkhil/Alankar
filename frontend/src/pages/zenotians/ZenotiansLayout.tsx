import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { getZenotians } from '../../api/zenotians';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, Drawer, EmptyState, ErrorState } from '../../components/ui';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn } from '../../lib/cn';
import type { ZenotiansContext } from './context';
import { buildMenu, ROOT, type MenuEntry } from './model';

const linkBase =
  'flex min-h-10 items-center gap-2 rounded-nested px-3 text-sm font-medium text-text-muted hover:bg-primary-soft hover:text-text focus-visible:shadow-focus focus-visible:outline-none';
const linkActive = 'bg-primary-soft text-primary-hover ring-1 ring-primary-light';

function Menu({ menu, onNavigate }: { menu: MenuEntry[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const [aboutOpen, setAboutOpen] = useState(pathname.startsWith(`${ROOT}/about/`));
  useEffect(() => {
    if (pathname.startsWith(`${ROOT}/about/`)) setAboutOpen(true);
  }, [pathname]);

  return (
    <nav aria-label="For Zenotians sections">
      <ul className="flex flex-col gap-1">
        {menu.map((entry) => (
          <li key={entry.id}>
            {entry.children ? (
              <>
                <button
                  type="button"
                  aria-expanded={aboutOpen}
                  aria-controls={aboutOpen ? 'zen-about-menu' : undefined}
                  onClick={() => setAboutOpen((open) => !open)}
                  className={cn(
                    linkBase,
                    'w-full justify-between text-left',
                    pathname.startsWith(`${ROOT}/about/`) && 'text-primary-hover',
                  )}
                >
                  {entry.label}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('h-4 w-4 transition-transform', aboutOpen && 'rotate-180')}
                  />
                </button>
                {aboutOpen && (
                  <ul
                    id="zen-about-menu"
                    className="mt-1 flex flex-col gap-1 border-l border-border pl-3 ml-3"
                  >
                    {entry.children.map((child) => (
                      <li key={child.id}>
                        <NavLink
                          to={child.path}
                          onClick={onNavigate}
                          className={({ isActive }) => cn(linkBase, isActive && linkActive)}
                        >
                          {child.label}
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
                className={({ isActive }) => cn(linkBase, isActive && linkActive)}
              >
                {entry.label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function ZenotiansLayout() {
  useDocumentTitle('For Zenotians');
  const query = useQuery({ queryKey: ['zenotians'], queryFn: getZenotians, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
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
    <PageContainer className="zen-print-area pb-xl pt-md">
      <a
        href="#zen-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to this section
      </a>
      <div className="grid gap-lg lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="zen-noprint lg:sticky lg:top-[5.5rem] lg:self-start">
          <div className="glass-dense hidden rounded-card p-3 lg:block">
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
            <Menu menu={menu} onNavigate={() => setOpen(false)} />
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
  );
}
