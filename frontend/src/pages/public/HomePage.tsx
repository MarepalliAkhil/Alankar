import {
  ArrowRight,
  CalendarCheck,
  CreditCard,
  Scissors,
  Sparkles,
  Star,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card } from '../../components/ui';
import { brand } from '../../config/brand';
import { divisions, type DivisionId } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const divisionIcons: Record<DivisionId, ReactNode> = {
  salon: <Scissors className="h-6 w-6" />,
  spa: <Waves className="h-6 w-6" />,
  'beauty-parlor': <Sparkles className="h-6 w-6" />,
};

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

export default function HomePage() {
  useDocumentTitle();
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
        <p className="mt-md max-w-2xl text-lg text-text-muted">
          Book your visit online. Send a request, we confirm your stylist and time, and you pay
          securely with the link we send you.
        </p>
        <div className="mt-lg flex flex-wrap justify-center gap-sm sm:justify-start">
          <ButtonLink to={BOOK_NOW_PATH} size="lg">
            Book Now
          </ButtonLink>
          <ButtonLink to="/salon" variant="secondary" size="lg">
            Explore services
          </ButtonLink>
        </div>
      </Card>

      <section aria-labelledby="divisions-title">
        <h2 id="divisions-title" className="text-2xl font-bold text-text">
          Our divisions
        </h2>
        <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((division) => (
            <li key={division.id}>
              <Link
                to={division.path}
                className="group block h-full rounded-card focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Card className="flex h-full flex-col gap-sm transition-transform duration-base ease-brand group-hover:-translate-y-1">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-hover"
                  >
                    {divisionIcons[division.id]}
                  </span>
                  <h3 className="text-lg font-semibold text-text">{division.label}</h3>
                  <p className="text-sm text-text-muted">{division.summary}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-sm text-sm font-medium text-primary-hover">
                    View services <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

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
    </PageContainer>
  );
}
