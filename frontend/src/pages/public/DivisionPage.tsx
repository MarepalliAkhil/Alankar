import { useQuery } from '@tanstack/react-query';
import { Phone, Search, SearchX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCategories, getServices, getTeam, type Audience, type Service } from '../../api/public';
import { ServiceCard } from '../../components/catalogue/ServiceCard';
import { ServiceSheet } from '../../components/catalogue/ServiceSheet';
import { TeamGrid } from '../../components/catalogue/TeamGrid';
import { PageContainer } from '../../components/layout/PageContainer';
import { useRouteTheme } from '../../design/display';
import { divisionTheme } from '../../design/themes';
import {
  ArtImage,
  BrandMark,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  SkeletonCards,
  type ChipOption,
} from '../../components/ui';
import { BOOK_NOW_PATH } from '../../config/paths';
import type { ArtId } from '../../design/art';
import { useSite } from '../../hooks/useSite';
import { bookingTarget } from '../../routes/booking';
import { useSession } from '../../session/session-context';
import { getDivision, type DivisionId } from '../../config/divisions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type AudienceFilter = Audience | 'all';

const HERO: Record<DivisionId, ArtId> = {
  salon: 'salonHero',
  spa: 'spaHero',
  'beauty-parlor': 'parlorHero',
};

const audienceOptions: ChipOption<AudienceFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'kids', label: 'Kids' },
  { value: 'unisex', label: 'Unisex' },
];

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Division page: services from the database with filters, search and a detail sheet. */
export default function DivisionPage({ divisionId }: { divisionId: DivisionId }) {
  useRouteTheme(divisionTheme[divisionId]);
  const division = getDivision(divisionId);
  useDocumentTitle(division.label);
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Service | null>(null);
  const q = useDebounced(search.trim());

  const categories = useQuery({
    queryKey: ['categories', divisionId],
    queryFn: () => getCategories(divisionId),
  });
  const services = useQuery({
    queryKey: ['services', divisionId, audience, category, q],
    queryFn: () =>
      getServices({
        division: divisionId,
        audience: audience === 'all' ? undefined : audience,
        category: category === 'all' ? undefined : category,
        q: q || undefined,
      }),
    placeholderData: (previous) => previous,
  });
  const team = useQuery({ queryKey: ['team', divisionId], queryFn: () => getTeam(divisionId) });
  const site = useSite();
  const { user } = useSession();
  const book = bookingTarget(user) ?? (user ? null : BOOK_NOW_PATH);
  const tel = site.data?.contact?.phone?.replace(/[^\d+]/g, '');
  const total = site.data?.stats?.divisions[divisionId];

  const filtered = audience !== 'all' || category !== 'all' || q !== '';
  const clearFilters = () => {
    setAudience('all');
    setCategory('all');
    setSearch('');
  };

  const categoryOptions: ChipOption<string>[] = [
    { value: 'all', label: 'All categories' },
    ...(categories.data ?? []).map((c) => ({ value: c.slug, label: c.name })),
  ];

  return (
    <PageContainer className="flex flex-col gap-lg pb-2xl pt-lg">
      <header className="relative overflow-hidden rounded-modal shadow-raised">
        <ArtImage
          slot={HERO[divisionId]}
          priority
          overlay
          className="absolute inset-0 h-full w-full"
        />
        <div className="relative flex flex-col gap-md p-sm sm:p-xl md:flex-row md:items-end md:justify-between">
          <div className="glass-dense flex max-w-2xl flex-col gap-sm rounded-card p-lg">
            <div className="flex items-center gap-sm">
              <BrandMark theme={divisionTheme[divisionId]} className="mark-still h-12 w-12" />
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-hover">
                Services
              </p>
            </div>
            <h1 className="text-4xl font-bold text-text sm:text-5xl">{division.label}</h1>
            <p className="text-lg text-text-muted">{division.summary}</p>
            <p className="text-sm text-text">
              {total !== undefined && (
                <>
                  {total} {total === 1 ? 'service' : 'services'}
                  {categories.data && categories.data.length > 0
                    ? ` in ${categories.data.length} ${categories.data.length === 1 ? 'category' : 'categories'}`
                    : ''}
                  {' · '}
                </>
              )}
              Every price includes GST.
            </p>
            <div className="mt-xs flex flex-wrap items-center gap-sm">
              {book && <ButtonLink to={book}>Book Now</ButtonLink>}
              {tel && (
                <a
                  href={`tel:${tel}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <Phone aria-hidden="true" className="h-4 w-4" /> Call the salon
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <Card variant="dense" className="flex flex-col gap-md">
        <div className="relative max-w-md">
          <Input
            label="Search services"
            type="search"
            placeholder={`Search ${division.label.toLowerCase()} services`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 left-3.5 h-4 w-4 text-text-muted"
          />
        </div>
        <FilterChips
          label="Who is it for"
          options={audienceOptions}
          value={audience}
          onChange={setAudience}
        />
        {categoryOptions.length > 2 && (
          <FilterChips
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={setCategory}
          />
        )}
      </Card>

      <section aria-label={`${division.label} services`}>
        {services.isPending ? (
          <SkeletonCards count={6} label="Loading services…" />
        ) : services.isError ? (
          <Card variant="dense">
            <ErrorState
              description="We couldn't load the services. Please try again."
              onRetry={() => void services.refetch()}
            />
          </Card>
        ) : services.data.length === 0 ? (
          <Card variant="dense">
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title={filtered ? 'No services match your filters' : 'No services listed yet'}
              description={
                filtered
                  ? 'Try another filter or search word.'
                  : `${division.label} services will appear here as soon as the salon publishes them.`
              }
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
              <p className="text-sm font-medium text-text" aria-live="polite">
                {services.data.length} {services.data.length === 1 ? 'service' : 'services'}
                {filtered ? ' match your filters' : ''}
              </p>
              {filtered && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-full px-sm py-1 text-sm font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="h-4 w-4" /> Reset filters
                </button>
              )}
            </div>
            <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {services.data.map((service) => (
                <li key={service.id}>
                  <ServiceCard service={service} onOpen={() => setOpen(service)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {team.data && team.data.length > 0 && (
        <section aria-labelledby="division-team" className="mt-xl">
          <h2 id="division-team" className="mb-md text-2xl font-bold text-text sm:text-3xl">
            Our {division.label.toLowerCase()} team
          </h2>
          <TeamGrid team={team.data} />
        </section>
      )}

      <ServiceSheet service={open} onClose={() => setOpen(null)} />
    </PageContainer>
  );
}
