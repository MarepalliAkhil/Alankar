import { ArrowDown, MapPin, Phone } from 'lucide-react';
import type { SiteData } from '../../api/public';
import { brand } from '../../config/brand';
import { AlankarIcon, ButtonLink } from '../ui';
import { PageContainer } from '../layout/PageContainer';

export interface HomeHeroProps {
  site: SiteData | undefined;
  loading: boolean;
  /** Where "Book a visit" goes (the sign-in step for guests). */
  book: string;
  /** Staff who open the public site get a way back to their own screens instead of booking. */
  staffHome: string | null;
  tel: string | undefined;
}

/**
 * The first screen. It has to say in five seconds what this is: a salon, a spa and a beauty parlor
 * with online booking. The words sit in one glass card over the Alankar reception photo (the home background), and the
 * shop's real hours, address and phone sit right under the buttons (all from the shop settings).
 */
export function HomeHero({ site, loading, book, staffHome, tel }: HomeHeroProps) {
  const hours = (site?.hours ?? []).slice(0, 2);
  const contact = site?.contact;
  return (
    <section
      id="home-alankar"
      tabIndex={-1}
      data-hero="home"
      data-home-chapter="1"
      aria-labelledby="home-title"
      className="relative scroll-mt-0 focus:outline-none"
    >
      <PageContainer className="relative flex min-h-[100svh] items-center py-xl">
        <div className="glass-photo flex max-w-3xl flex-col gap-lg rounded-card p-lg lg:p-xl">
          <p className="inline-flex w-fit items-center gap-sm rounded-full border border-border bg-surface px-md py-1 text-sm font-medium text-primary-hover">
            <AlankarIcon name="scissors" className="h-4 w-4" />
            <span>{brand.shopTagline}</span>
          </p>
          <h1 id="home-title" className="text-6xl">
            Hair, skin and a quiet hour.{' '}
            <span className="block text-primary-hover">Book it online.</span>
          </h1>
          <p className="max-w-[52ch] text-lg text-text-muted">
            {brand.shopName} is a salon, a spa and a beauty parlor under one roof. Pick a service,
            your stylist confirms the time, and you pay on a secure link. Then you just walk in.
          </p>
          <p className="flex items-start gap-sm text-base text-text">
            <AlankarIcon name="approve" className="mt-0.5 h-5 w-5 shrink-0 text-primary-hover" />
            Your stylist and the front desk both say yes before anything is final.
          </p>
          <div className="flex flex-wrap items-center gap-sm">
            {staffHome ? (
              <ButtonLink to={staffHome} size="lg">
                Go to your dashboard
              </ButtonLink>
            ) : (
              <ButtonLink to={book} size="lg">
                Book a visit
              </ButtonLink>
            )}
            <a
              href="#home-salon"
              className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-semibold text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
            >
              See what we do <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
          <ul
            aria-label="Visit details"
            className="flex flex-col gap-sm border-t border-border pt-md text-sm text-text-muted sm:flex-row sm:flex-wrap sm:gap-lg"
          >
            {loading && !site && <li>Loading hours and address…</li>}
            {hours.map((row) => (
              <li key={row.days} className="flex items-center gap-sm">
                <AlankarIcon name="door" className="h-4 w-4 text-primary-hover" />
                <span className="tabular">
                  {row.closed ? `${row.days}: closed` : `${row.days}: ${row.open} to ${row.close}`}
                </span>
              </li>
            ))}
            {contact?.address && (
              <li className="flex items-center gap-sm">
                <MapPin aria-hidden="true" className="h-4 w-4 text-primary-hover" />
                {contact.address}
              </li>
            )}
            {contact?.phone && tel && (
              <li>
                <a
                  href={`tel:${tel}`}
                  className="flex items-center gap-sm font-medium text-primary-hover underline-offset-4 hover:underline"
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {contact.phone}
                </a>
              </li>
            )}
          </ul>
        </div>
      </PageContainer>
    </section>
  );
}
