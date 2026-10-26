import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CreditCard, Phone, Sparkles, Star, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeam } from '../../api/public';
import { divisionIcon } from '../../components/catalogue/icons';
import { TeamGrid } from '../../components/catalogue/TeamGrid';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  Accordion,
  Badge,
  ButtonLink,
  Card,
  CountUp,
  ErrorState,
  Modal,
  Skeleton,
} from '../../components/ui';
import { brand } from '../../config/brand';
import { divisions, type Division } from '../../config/divisions';
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

export default function HomePage() {
  useDocumentTitle();
  const site = useSite();
  const team = useQuery({ queryKey: ['team', 'all'], queryFn: () => getTeam() });
  const { user } = useSession();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const book = bookingTarget(user) ?? (user ? user.home : BOOK_NOW_PATH);
  const data = site.data;
  const stats = data?.stats;
  const tel = data?.contact?.phone?.replace(/[^\d+]/g, '');

  return (
    <PageContainer className="flex flex-col gap-2xl pt-xl">
      <Card
        as="section"
        padding="lg"
        aria-labelledby="hero-title"
        className="text-center sm:text-left"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-hover">
          {brand.shopTagline}
        </p>
        <h1 id="hero-title" className="mt-2 text-4xl font-bold text-text sm:text-5xl">
          {brand.shopName}
        </h1>
        {site.isPending ? (
          <div className="mt-md flex flex-col gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            {data?.hero?.headline && (
              <p className="mt-md text-2xl font-semibold text-text">{data.hero.headline}</p>
            )}
            <p className="mt-sm max-w-2xl text-lg text-text-muted">
              {data?.hero?.subtitle ??
                'Book your visit online. Send a request, we confirm your stylist and time, and you pay securely with the link we send you.'}
            </p>
          </>
        )}
        <div className="mt-lg flex flex-wrap justify-center gap-sm sm:justify-start">
          {user?.role !== 'customer' && user ? (
            <ButtonLink to={user.home} size="lg">
              Go to dashboard
            </ButtonLink>
          ) : (
            <ButtonLink to={book} size="lg">
              Book Now
            </ButtonLink>
          )}
          <ButtonLink to="/salon" variant="secondary" size="lg">
            Explore services
          </ButtonLink>
          {tel && (
            <a
              href={`tel:${tel}`}
              className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-medium text-primary-hover hover:bg-primary-soft"
            >
              <Phone aria-hidden="true" className="h-4 w-4" /> Call salon
            </a>
          )}
        </div>
      </Card>

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
        <Card as="section" aria-labelledby="about-title" className="flex flex-col gap-sm">
          <h2 id="about-title" className="text-2xl font-bold text-text">
            {data.about.heading || `About ${brand.shopName}`}
          </h2>
          <p className="line-clamp-3 max-w-3xl text-text-muted">{data.about.body}</p>
          <button
            type="button"
            className="self-start text-sm font-medium text-primary-hover underline-offset-4 hover:underline"
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
      )}

      <section aria-labelledby="divisions-title">
        <h2 id="divisions-title" className="text-2xl font-bold text-text">
          Our divisions
        </h2>
        <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((division) => (
            <li key={division.id}>
              <button
                type="button"
                onClick={() => setSheet({ kind: 'division', division })}
                className="group block h-full w-full rounded-card text-left focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Card className="flex h-full flex-col gap-sm transition-transform duration-base ease-brand group-hover:-translate-y-1">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-hover"
                  >
                    {divisionIcon[division.id]}
                  </span>
                  <h3 className="text-lg font-semibold text-text">{division.label}</h3>
                  <p className="text-sm text-text-muted">{division.summary}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-sm text-sm font-medium text-primary-hover">
                    {stats ? `${stats.divisions[division.id] ?? 0} services` : 'View services'}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {stats && (
        <section aria-labelledby="numbers-title">
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
                <p className="text-3xl font-bold text-primary-hover">
                  <CountUp value={item.value} suffix={item.suffix} />
                </p>
                <p className="mt-1 text-sm text-text-muted">{item.label}</p>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {data && data.offers.length > 0 && (
        <section aria-labelledby="offers-title">
          <h2 id="offers-title" className="text-2xl font-bold text-text">
            Offers
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {data.offers.map((offer) => (
              <li key={offer.id}>
                <button
                  type="button"
                  className="block h-full w-full rounded-card text-left focus-visible:shadow-focus focus-visible:outline-none"
                  onClick={() =>
                    setSheet({
                      kind: 'offer',
                      title: offer.title,
                      description: offer.description,
                      validUntil: offer.valid_until,
                    })
                  }
                >
                  <Card className="flex h-full flex-col gap-sm">
                    <span className="inline-flex items-center gap-sm">
                      <Tag aria-hidden="true" className="h-4 w-4 text-primary-hover" />
                      {offer.badge && <Badge tone="primary">{offer.badge}</Badge>}
                    </span>
                    <h3 className="font-semibold text-text">{offer.title}</h3>
                    <p className="line-clamp-2 text-sm text-text-muted">{offer.description}</p>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-2xl font-bold text-text">
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
      </section>

      {team.data && team.data.length > 0 && (
        <section aria-labelledby="team-title">
          <h2 id="team-title" className="mb-md text-2xl font-bold text-text">
            Meet the team
          </h2>
          <TeamGrid team={team.data} />
        </section>
      )}

      {data && data.faqs.length > 0 && (
        <section aria-labelledby="faq-title">
          <h2 id="faq-title" className="mb-md text-2xl font-bold text-text">
            Questions
          </h2>
          <Accordion
            items={data.faqs.map((faq) => ({
              id: faq.id,
              title: faq.question,
              content: faq.answer,
            }))}
          />
        </section>
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
    </PageContainer>
  );
}
