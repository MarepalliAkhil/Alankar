import { useQuery } from '@tanstack/react-query';
import { MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { buttonClasses } from '../../components/ui/button-styles';
import { getServices, getTeam, type Service } from '../../api/public';
import { TeamGrid } from '../../components/catalogue/TeamGrid';
import { ServiceSheet } from '../../components/catalogue/ServiceSheet';
import { DivisionSection } from '../../components/home/DivisionSection';
import { HomeBackdrop } from '../../components/home/HomeBackdrop';
import { HomeHero } from '../../components/home/HomeHero';
import { HomeSideNav } from '../../components/home/HomeSideNav';
import { Reveal } from '../../components/home/Reveal';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  Accordion,
  AlankarIcon,
  Badge,
  ButtonLink,
  CountUp,
  ErrorState,
  Modal,
} from '../../components/ui';
import { brand } from '../../config/brand';
import { BOOK_NOW_PATH } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useHomeChapter } from '../../hooks/useHomeChapter';
import { useSite } from '../../hooks/useSite';
import { bookingTarget } from '../../routes/booking';
import { useSession } from '../../session/session-context';

type Sheet =
  | { kind: 'offer'; title: string; description: string; validUntil: string | null }
  | { kind: 'about'; heading: string; body: string };

const h2 = 'text-4xl';

/**
 * The home page. Sections deliberately differ in layout and spacing: a tight hero, a bento of
 * three divisions, a six-chapter story, a price board, an offers strip, a two-column about, the
 * team, a visit block with real hours, and a closing band.
 */
export default function HomePage() {
  useDocumentTitle();
  const site = useSite();
  const team = useQuery({ queryKey: ['team', 'all'], queryFn: () => getTeam() });
  const servicesQuery = useQuery({
    queryKey: ['services', 'home'],
    queryFn: () => getServices({}),
  });
  const services = servicesQuery.data ?? [];
  const [openService, setOpenService] = useState<Service | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const { user } = useSession();
  const book = bookingTarget(user) ?? (user ? user.home : BOOK_NOW_PATH);
  /** "Book salon / spa / parlor": the booking page with that division chosen (guests sign in first). */
  const bookDivision = (id: string) => {
    if (user && user.role !== 'customer') return null;
    const sheet = `/customer/book?division=${id}`;
    return user ? sheet : `/login?role=customer&next=${encodeURIComponent(sheet)}`;
  };
  const isCustomerView = !user || user.role === 'customer';
  const data = site.data;
  const stats = data?.stats;
  const contact = data?.contact;
  const tel = contact?.phone?.replace(/[^\d+]/g, '');
  const chapter = useHomeChapter();

  const numbers = [
    ...(data?.achievements ?? []).map((a) => ({
      key: `a-${a.id}`,
      value: a.value,
      suffix: a.suffix,
      label: a.label,
    })),
    ...(stats
      ? [
          { key: 'services', value: stats.services, suffix: '', label: 'Services' },
          { key: 'team', value: stats.team, suffix: '', label: 'People on the team' },
        ]
      : []),
  ];

  return (
    <>
      {/* The story zone: the intro and the three divisions share ONE sticky full-window background
          that changes with the section in view (Alankar, Salon, Spa, Parlor). */}
      <div data-home-zone className="relative isolate">
        <HomeBackdrop chapter={chapter} firstImage={data?.hero?.image_url || null} />
        <HomeSideNav chapter={chapter} />
        <div className="relative z-10">
          <HomeHero
            site={data}
            loading={site.isPending}
            book={book}
            staffHome={user && user.role !== 'customer' ? user.home : null}
            tel={tel}
          />
          {site.isError && (
            <PageContainer className="py-md">
              <ErrorState
                title="Some content could not be loaded"
                description="Services and contact details will appear when the connection is back."
                onRetry={() => void site.refetch()}
              />
            </PageContainer>
          )}
          {(['salon', 'spa', 'beauty-parlor'] as const).map((id) => (
            <DivisionSection
              key={id}
              id={id}
              services={services}
              loading={servicesQuery.isPending}
              bookTo={bookDivision(id)}
              onOpenService={setOpenService}
            />
          ))}
        </div>
      </div>

      {data && data.offers.length > 0 && (
        <section aria-labelledby="offers-title" className="bg-surface-muted py-xl">
          <PageContainer>
            <h2 id="offers-title" className="mb-md text-2xl">
              On offer now
            </h2>
            <ul className="flex snap-x gap-md overflow-x-auto pb-sm [scrollbar-width:thin] md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
              {data.offers.map((offer) => (
                <li key={offer.id} className="w-[80%] shrink-0 snap-start md:w-auto">
                  <button
                    type="button"
                    className="flex h-full w-full flex-col gap-sm rounded-card border border-border bg-surface p-lg text-left transition-colors duration-base ease-brand hover:border-primary focus-visible:shadow-focus focus-visible:outline-none"
                    onClick={() =>
                      setSheet({
                        kind: 'offer',
                        title: offer.title,
                        description: offer.description,
                        validUntil: offer.valid_until,
                      })
                    }
                  >
                    {offer.badge && (
                      <Badge tone="primary" className="w-fit">
                        {offer.badge}
                      </Badge>
                    )}
                    <span className="font-display text-xl">{offer.title}</span>
                    <span className="line-clamp-2 text-sm text-text-muted">
                      {offer.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PageContainer>
        </section>
      )}

      {(data?.about?.body || numbers.length > 0) && (
        <section aria-labelledby="about-title" className="py-2xl">
          <PageContainer className="grid gap-xl lg:grid-cols-12">
            {data?.about?.body && (
              <Reveal className="flex flex-col gap-md lg:col-span-7">
                <h2 id="about-title" className={h2}>
                  {data.about.heading || `About ${brand.shopName}`}
                </h2>
                <p className="line-clamp-5 max-w-[60ch] text-lg text-text-muted">
                  {data.about.body}
                </p>
                <button
                  type="button"
                  className="w-fit text-sm font-semibold text-primary-hover underline-offset-4 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                  onClick={() =>
                    setSheet({
                      kind: 'about',
                      heading: data.about?.heading || `About ${brand.shopName}`,
                      body: data.about?.body ?? '',
                    })
                  }
                >
                  Read the whole story
                </button>
              </Reveal>
            )}
            {numbers.length > 0 && (
              <ul
                aria-label="The shop in numbers"
                className="grid grid-cols-2 gap-x-lg gap-y-md self-start border-t border-border pt-md lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-lg lg:pt-0"
              >
                {numbers.map((item) => (
                  <li key={item.key}>
                    <p className="font-display text-5xl text-primary-hover">
                      <CountUp value={item.value} suffix={item.suffix} />
                    </p>
                    <p className="text-sm text-text-muted">{item.label}</p>
                  </li>
                ))}
              </ul>
            )}
          </PageContainer>
        </section>
      )}

      {team.data && team.data.length > 0 && (
        <section aria-labelledby="team-title" className="pb-2xl">
          <PageContainer>
            <h2 id="team-title" className={`mb-md ${h2}`}>
              Who will look after you
            </h2>
            <TeamGrid team={team.data} />
          </PageContainer>
        </section>
      )}

      <section
        id="visit"
        aria-labelledby="visit-title"
        className="scroll-mt-24 bg-surface-muted py-2xl"
      >
        <PageContainer className="grid gap-xl lg:grid-cols-12">
          <div className="flex flex-col gap-md lg:col-span-5">
            <h2 id="visit-title" className={h2}>
              Come by
            </h2>
            {contact?.address && (
              <p className="flex items-start gap-sm text-lg">
                <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary-hover" />
                {contact.address}
              </p>
            )}
            {contact?.phone && tel && (
              <p className="flex items-center gap-sm text-lg">
                <Phone aria-hidden="true" className="h-5 w-5 text-primary-hover" />
                <a href={`tel:${tel}`} className="underline-offset-4 hover:underline">
                  {contact.phone}
                </a>
              </p>
            )}
            {contact?.email && (
              <p className="text-lg">
                <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
                  {contact.email}
                </a>
              </p>
            )}
            {contact?.map_url && (
              <a
                href={contact.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonClasses('secondary', 'md'), 'w-fit')}
              >
                Get directions
              </a>
            )}
          </div>
          {data?.hours && data.hours.length > 0 && (
            <div className="lg:col-span-7">
              <h3 className="mb-sm flex items-center gap-sm text-lg">
                <AlankarIcon name="door" className="h-5 w-5 text-primary-hover" />
                Opening hours
              </h3>
              <dl className="divide-y divide-border rounded-card border border-border bg-surface">
                {data.hours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-md px-lg py-sm">
                    <dt className="font-medium">{row.days}</dt>
                    <dd className="tabular text-text-muted">
                      {row.closed ? 'Closed' : `${row.open} to ${row.close}`}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <p className="text-sm text-text-muted lg:col-span-12">
            Independent portfolio project, not affiliated with Zenoti.
          </p>
        </PageContainer>
      </section>

      {data && data.faqs.length > 0 && (
        <section aria-labelledby="faq-title" className="py-2xl">
          <PageContainer className="grid gap-lg lg:grid-cols-12">
            <h2 id="faq-title" className={`lg:col-span-4 ${h2}`}>
              Before you book
            </h2>
            <div className="lg:col-span-8">
              <Accordion
                items={data.faqs.map((faq) => ({
                  id: faq.id,
                  title: faq.question,
                  content: faq.answer,
                }))}
              />
            </div>
          </PageContainer>
        </section>
      )}

      {isCustomerView && (
        <section aria-labelledby="cta-title" className="pb-2xl">
          <PageContainer>
            <div className="flex flex-col items-start gap-md rounded-card bg-primary px-lg py-xl text-on-primary sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="cta-title" className="text-3xl">
                  Pick a service. We will take it from there.
                </h2>
                <p className="mt-1 opacity-90">
                  You will hear from us as soon as your stylist has said yes to the time.
                </p>
              </div>
              <ButtonLink to={book} size="lg" variant="secondary">
                Book a visit
              </ButtonLink>
            </div>
          </PageContainer>
        </section>
      )}

      {sheet?.kind === 'offer' && (
        <Modal
          open
          onClose={() => setSheet(null)}
          title={sheet.title}
          description={
            sheet.validUntil
              ? `Valid until ${new Date(sheet.validUntil).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
              : undefined
          }
          footer={isCustomerView && <ButtonLink to={book}>Book a visit</ButtonLink>}
        >
          <p className="text-sm text-text">{sheet.description}</p>
        </Modal>
      )}
      {sheet?.kind === 'about' && (
        <Modal open onClose={() => setSheet(null)} title={sheet.heading}>
          <p className="whitespace-pre-line text-sm text-text">{sheet.body}</p>
        </Modal>
      )}
      <ServiceSheet service={openService} onClose={() => setOpenService(null)} />
    </>
  );
}
