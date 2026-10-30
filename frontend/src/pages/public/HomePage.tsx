import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CreditCard, MapPin, Sparkles, Star, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getServices, getTeam, type Service } from '../../api/public';
import { divisionIcon } from '../../components/catalogue/icons';
import { ServiceCard } from '../../components/catalogue/ServiceCard';
import { ServiceSheet } from '../../components/catalogue/ServiceSheet';
import { TeamGrid } from '../../components/catalogue/TeamGrid';
import { HomeHero } from '../../components/home/HomeHero';
import { Reveal } from '../../components/home/Reveal';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  Accordion,
  ArtImage,
  Badge,
  ButtonLink,
  Card,
  CountUp,
  ErrorState,
  Modal,
} from '../../components/ui';
import { brand } from '../../config/brand';
import { divisions, type Division, type DivisionId } from '../../config/divisions';
import { ThemeScope } from '../../design/ThemeProvider';
import type { ArtId } from '../../design/art';
import { divisionTheme } from '../../design/themes';
import { BOOK_NOW_PATH } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSite } from '../../hooks/useSite';
import { bookingTarget } from '../../routes/booking';
import { useSession } from '../../session/session-context';

// How the booking flow works (product behaviour, not editable shop content).
const steps = [
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: 'Pick a service',
    text: 'Choose a service, your preferred time and stylist.',
  },
  {
    icon: <CalendarCheck className="h-5 w-5" />,
    title: 'We confirm',
    text: 'Our front desk confirms your stylist and time.',
  },
  {
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Pay the link',
    text: 'Pay securely online to lock in your slot.',
  },
  {
    icon: <Star className="h-5 w-5" />,
    title: 'Visit and rate',
    text: 'Enjoy your visit, then rate your stylist.',
  },
];

type Sheet =
  | { kind: 'division'; division: Division }
  | { kind: 'offer'; title: string; description: string; validUntil: string | null }
  | { kind: 'about'; heading: string; body: string };

const DIVISION_ART: Record<DivisionId, ArtId> = {
  salon: 'salonBackground',
  spa: 'spaBackground',
  'beauty-parlor': 'parlorBackground',
};

/** Up to two services per division, in the shop's own order (there is no "featured" flag). */
function featured(services: readonly Service[]): Service[] {
  return divisions.flatMap((d) => services.filter((s) => s.division === d.id).slice(0, 2));
}

const sectionTitle = 'text-2xl font-bold text-text sm:text-3xl';

export default function HomePage() {
  useDocumentTitle();
  const site = useSite();
  const team = useQuery({ queryKey: ['team', 'all'], queryFn: () => getTeam() });
  const services = useQuery({ queryKey: ['services', 'home'], queryFn: () => getServices({}) });
  const picks = featured(services.data ?? []);
  const [openService, setOpenService] = useState<Service | null>(null);
  const { user } = useSession();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const book = bookingTarget(user) ?? (user ? user.home : BOOK_NOW_PATH);
  const data = site.data;
  const stats = data?.stats;
  const tel = data?.contact?.phone?.replace(/[^\d+]/g, '');

  return (
    <>
      <HomeHero
        site={data}
        loading={site.isPending}
        book={book}
        staffHome={user && user.role !== 'customer' ? user.home : null}
        tel={tel}
      />
      <PageContainer className="flex flex-col gap-2xl py-2xl">
        {site.isError && (
          <Card variant="dense">
            <ErrorState
              title="Some content could not be loaded"
              description="Services and contact details will appear when the connection is back."
              onRetry={() => void site.refetch()}
            />
          </Card>
        )}

        {data?.about?.body && (
          <Reveal as="section" aria-labelledby="about-title">
            <Card padding="lg" className="flex flex-col gap-sm">
              <h2 id="about-title" className={sectionTitle}>
                {data.about.heading || `About ${brand.shopName}`}
              </h2>
              <p className="line-clamp-3 max-w-3xl text-text-muted">{data.about.body}</p>
              <button
                type="button"
                className="self-start rounded-full text-sm font-medium text-primary-hover underline-offset-4 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                onClick={() =>
                  setSheet({
                    kind: 'about',
                    heading: data.about?.heading || `About ${brand.shopName}`,
                    body: data.about?.body ?? '',
                  })
                }
              >
                Read more
              </button>
            </Card>
          </Reveal>
        )}

        <Reveal as="section" aria-labelledby="divisions-title">
          <h2 id="divisions-title" className={sectionTitle}>
            Our divisions
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {divisions.map((division) => (
              <li key={division.id}>
                <ThemeScope theme={divisionTheme[division.id]} className="h-full">
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'division', division })}
                    className="group block h-full w-full rounded-card text-left focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    <Card
                      padding="none"
                      className="flex h-full flex-col overflow-hidden transition-transform duration-base ease-brand group-hover:-translate-y-1"
                    >
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <ArtImage
                          slot={DIVISION_ART[division.id]}
                          className="h-full w-full transition-transform duration-slow ease-brand group-hover:scale-105"
                        />
                        <span
                          aria-hidden="true"
                          className="glass-dense absolute bottom-md left-md inline-flex h-12 w-12 items-center justify-center rounded-full text-primary-hover"
                        >
                          {divisionIcon[division.id]}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-sm p-lg">
                        <h3 className="text-lg font-semibold text-text">{division.label}</h3>
                        <p className="text-sm text-text-muted">{division.summary}</p>
                        <span className="mt-auto inline-flex items-center gap-1 pt-sm text-sm font-medium text-primary-hover">
                          {stats
                            ? `${stats.divisions[division.id] ?? 0} services`
                            : 'View services'}
                          <ArrowRight
                            aria-hidden="true"
                            className="h-4 w-4 transition-transform duration-base ease-brand group-hover:translate-x-1"
                          />
                        </span>
                      </div>
                    </Card>
                  </button>
                </ThemeScope>
              </li>
            ))}
          </ul>
        </Reveal>

        {picks.length > 0 && (
          <Reveal as="section" aria-labelledby="featured-title">
            <div className="flex flex-wrap items-end justify-between gap-sm">
              <h2 id="featured-title" className={sectionTitle}>
                Featured services
              </h2>
              <p className="text-sm text-text-muted">Prices include GST.</p>
            </div>
            <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {picks.map((service) => (
                <li key={service.id}>
                  <ThemeScope theme={divisionTheme[service.division]} className="h-full">
                    <ServiceCard service={service} onOpen={() => setOpenService(service)} />
                  </ThemeScope>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        {stats && (
          <Reveal as="section" aria-labelledby="numbers-title">
            <h2 id="numbers-title" className="sr-only">
              In numbers
            </h2>
            <ul className="grid grid-cols-2 gap-md lg:grid-cols-4">
              {[
                ...(data?.achievements ?? []).map((a) => ({
                  key: `a-${a.id}`,
                  value: a.value,
                  suffix: a.suffix,
                  label: a.label,
                })),
                { key: 'services', value: stats.services, suffix: '', label: 'Services' },
                { key: 'team', value: stats.team, suffix: '', label: 'Team members' },
                { key: 'divisions', value: divisions.length, suffix: '', label: 'Divisions' },
              ].map((item) => (
                <Card as="li" key={item.key} variant="dense" className="text-center">
                  <p className="text-3xl font-bold text-primary-hover sm:text-4xl">
                    <CountUp value={item.value} suffix={item.suffix} />
                  </p>
                  <p className="mt-1 text-sm text-text-muted">{item.label}</p>
                </Card>
              ))}
            </ul>
          </Reveal>
        )}

        {data && data.offers.length > 0 && (
          <Reveal as="section" aria-labelledby="offers-title">
            <h2 id="offers-title" className={sectionTitle}>
              Offers
            </h2>
            <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {data.offers.map((offer) => (
                <li key={offer.id}>
                  <button
                    type="button"
                    className="group block h-full w-full rounded-card text-left focus-visible:shadow-focus focus-visible:outline-none"
                    onClick={() =>
                      setSheet({
                        kind: 'offer',
                        title: offer.title,
                        description: offer.description,
                        validUntil: offer.valid_until,
                      })
                    }
                  >
                    <Card className="flex h-full flex-col gap-sm transition-transform duration-base ease-brand group-hover:-translate-y-1">
                      <span className="inline-flex items-center gap-sm">
                        <span
                          aria-hidden="true"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-hover"
                        >
                          <Tag className="h-4 w-4" />
                        </span>
                        {offer.badge && <Badge tone="primary">{offer.badge}</Badge>}
                      </span>
                      <h3 className="font-semibold text-text">{offer.title}</h3>
                      <p className="line-clamp-2 text-sm text-text-muted">{offer.description}</p>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        <Reveal as="section" aria-labelledby="steps-title">
          <h2 id="steps-title" className={sectionTitle}>
            How booking works
          </h2>
          <ol className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <Card as="li" key={step.title} variant="dense" className="flex flex-col gap-sm">
                <span className="inline-flex items-center gap-sm text-sm font-semibold text-primary-hover">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft"
                  >
                    {step.icon}
                  </span>
                  Step {index + 1}
                </span>
                <h3 className="font-semibold text-text">{step.title}</h3>
                <p className="text-sm text-text-muted">{step.text}</p>
              </Card>
            ))}
          </ol>
        </Reveal>

        {team.data && team.data.length > 0 && (
          <Reveal as="section" aria-labelledby="team-title">
            <h2 id="team-title" className={`mb-md ${sectionTitle}`}>
              Meet the team
            </h2>
            <TeamGrid team={team.data} />
          </Reveal>
        )}

        {data && data.faqs.length > 0 && (
          <Reveal as="section" aria-labelledby="faq-title">
            <h2 id="faq-title" className={`mb-md ${sectionTitle}`}>
              Questions
            </h2>
            <Accordion
              items={data.faqs.map((faq) => ({
                id: faq.id,
                title: faq.question,
                content: faq.answer,
              }))}
            />
          </Reveal>
        )}

        {(!user || user.role === 'customer') && (
          <Reveal as="section" aria-labelledby="visit-title">
            <Card
              padding="lg"
              className="flex flex-col items-start gap-md sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 id="visit-title" className={sectionTitle}>
                  Ready when you are
                </h2>
                <p className="mt-1 text-text-muted">
                  Send a request and we confirm your stylist and time. Hours and contact details are
                  just below.
                </p>
              </div>
              <div className="flex flex-wrap gap-sm">
                <ButtonLink to={book} size="lg">
                  Book Now
                </ButtonLink>
                {data?.contact?.map_url && (
                  <a
                    href={data.contact.map_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    <MapPin aria-hidden="true" className="h-4 w-4" /> Get directions
                  </a>
                )}
              </div>
            </Card>
          </Reveal>
        )}
        {sheet?.kind === 'division' && (
          <Modal
            open
            onClose={() => setSheet(null)}
            title={sheet.division.label}
            description={sheet.division.summary}
            footer={
              <>
                <ButtonLink to={sheet.division.path} variant="secondary">
                  View services
                </ButtonLink>
                {(!user || user.role === 'customer') && <ButtonLink to={book}>Book Now</ButtonLink>}
              </>
            }
          >
            <p className="text-sm text-text-muted">
              {stats
                ? `${stats.divisions[sheet.division.id] ?? 0} services to choose from. Filter by Men, Women or Kids and see every price, including GST, before you book.`
                : 'See every service and price, including GST, before you book.'}
            </p>
            <Link
              to={sheet.division.path}
              className="mt-md inline-flex items-center gap-1 text-sm font-medium text-primary-hover"
            >
              Browse {sheet.division.label} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Modal>
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
            footer={
              (!user || user.role === 'customer') && <ButtonLink to={book}>Book Now</ButtonLink>
            }
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
      </PageContainer>
    </>
  );
}
