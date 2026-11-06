import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Service } from '../../api/public';
import { divisions, type DivisionId } from '../../config/divisions';
import { ThemeScope } from '../../design/ThemeProvider';
import { divisionTheme } from '../../design/themes';
import { formatINR } from '../../lib/format';
import { PageContainer } from '../layout/PageContainer';
import { ButtonLink } from '../ui';

const CHAPTER: Record<DivisionId, { chapter: 2 | 3 | 4; id: string }> = {
  salon: { chapter: 2, id: 'home-salon' },
  spa: { chapter: 3, id: 'home-spa' },
  'beauty-parlor': { chapter: 4, id: 'home-parlor' },
};

/**
 * One home section per division (Salon, Spa, Parlor): a glass card over that division's photo with
 * a short description, a few real services from the shop data, and a booking button. When the
 * section is mostly in view the page background is that division's picture.
 */
export function DivisionSection({
  id,
  services,
  loading,
  bookTo,
  onOpenService,
}: {
  id: DivisionId;
  services: readonly Service[];
  loading: boolean;
  /** The booking page for guests (sign-in first) or customers; null for staff. */
  bookTo: string | null;
  onOpenService: (service: Service) => void;
}) {
  const division = divisions.find((d) => d.id === id)!;
  const { chapter, id: sectionId } = CHAPTER[id];
  const rows = services.filter((s) => s.division === id).slice(0, 4);
  const titleId = `${sectionId}-title`;
  return (
    <section
      id={sectionId}
      tabIndex={-1}
      data-home-chapter={chapter}
      aria-labelledby={titleId}
      className="flex min-h-[100svh] items-center py-xl focus:outline-none"
    >
      <PageContainer>
        <ThemeScope theme={divisionTheme[id]}>
          <div className="glass-photo flex max-w-xl flex-col gap-md rounded-card p-lg lg:p-xl">
            <h2 id={titleId} className="text-5xl">
              {division.label}
            </h2>
            <p className="text-lg text-text">{division.summary}</p>
            {loading ? (
              <p className="text-sm text-text">Loading services…</p>
            ) : rows.length > 0 ? (
              <ul aria-label={`${division.label} services`} className="divide-y divide-border">
                {rows.map((service) => (
                  <li key={service.id}>
                    <button
                      type="button"
                      onClick={() => onOpenService(service)}
                      className="flex w-full items-baseline justify-between gap-md rounded-input py-sm text-left hover:text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      <span className="font-medium">{service.name}</span>
                      <span className="tabular shrink-0 text-sm">
                        {formatINR(service.from_price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-sm">
              {bookTo && (
                <ButtonLink to={bookTo} size="lg">
                  Book {division.label.toLowerCase()}
                </ButtonLink>
              )}
              <Link
                to={division.path}
                className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-semibold text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
              >
                All {division.label} services <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ThemeScope>
      </PageContainer>
    </section>
  );
}
