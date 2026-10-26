import { useQuery } from '@tanstack/react-query';
import { Search, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCategories, getServices, getTeam, type Audience, type Service } from '../../api/public';
import { ServiceCard } from '../../components/catalogue/ServiceCard';
import { ServiceSheet } from '../../components/catalogue/ServiceSheet';
import { TeamGrid } from '../../components/catalogue/TeamGrid';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
  type ChipOption,
} from '../../components/ui';
import { getDivision, type DivisionId } from '../../config/divisions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type AudienceFilter = Audience | 'all';

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
    <PageContainer className="pb-xl">
      <PageHeader eyebrow="Services" title={division.label} description={division.summary} />

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

      <section aria-label={`${division.label} services`} className="mt-lg">
        {services.isPending ? (
          <Card variant="dense">
            <LoadingState label="Loading services…" lines={4} />
          </Card>
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
            <p className="mb-sm text-sm text-text-muted" aria-live="polite">
              {services.data.length} {services.data.length === 1 ? 'service' : 'services'}
            </p>
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
        <section aria-labelledby="division-team" className="mt-2xl">
          <h2 id="division-team" className="mb-md text-2xl font-bold text-text">
            Our {division.label.toLowerCase()} team
          </h2>
          <TeamGrid team={team.data} />
        </section>
      )}

      <ServiceSheet service={open} onClose={() => setOpen(null)} />
    </PageContainer>
  );
}
