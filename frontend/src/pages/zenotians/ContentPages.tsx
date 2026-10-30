import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageContainer';
import { Badge, Card } from '../../components/ui';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { buttonClasses } from '../../components/ui/button-styles';
import { useSeo } from '../../hooks/useSeo';
import { cn } from '../../lib/cn';
import {
  LazyFlowDiagram,
  LazyLifecycleDiagram,
  LazyRolesDiagram,
  LazyVisionOverviewDiagram,
} from './LazyDiagram';
import { useZenotians } from './context';
import { SectionGate } from './SectionGate';
import { Bullets, Chip, Ext, SourceNote } from './parts';
import { CONTACT_LABEL, ROOT, publicContacts, yearsSince } from './model';

const crumbs = (label: string) => [{ label: 'For Zenotians', to: ROOT }, { label }];

// --------------------------------------------------------------------------- About Zenoti

function AboutZenoti() {
  const { content } = useZenotians();
  const z = content.zenoti ?? {};
  useSeo('About Zenoti · For Zenotians', 'Public information from Zenoti’s website, with sources.');
  const checked = z.last_checked;
  const fact = (title: string, body: React.ReactNode) => (
    <Card variant="dense" className="flex h-full flex-col gap-2">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {body}
    </Card>
  );
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="About Zenoti"
        description={z.label || 'Public information from Zenoti’s website'}
        breadcrumb={crumbs('About Zenoti')}
      />
      <p className="text-sm text-text-muted">
        Only what Zenoti publishes about itself. Each fact links to where it was read.
      </p>
      <ul className="grid gap-md md:grid-cols-2">
        {z.founded_text && (
          <li>
            {fact(
              'Founded',
              <>
                <p className="text-text">{z.founded_text}</p>
                {z.founded_year ? (
                  <p className="text-2xl font-semibold text-primary-hover">
                    {yearsSince(z.founded_year)} years in business
                    <span className="block text-sm font-normal text-text-muted">
                      counted from {z.founded_year}
                    </span>
                  </p>
                ) : null}
                <SourceNote url={z.founded_source} checked={checked} />
              </>,
            )}
          </li>
        )}
        {z.customers_text && (
          <li>
            {fact(
              'Customers',
              <>
                <p className="text-text">{z.customers_text}</p>
                {z.customers_note && <p className="text-sm text-text-muted">{z.customers_note}</p>}
                <SourceNote url={z.customers_source} checked={checked} />
              </>,
            )}
          </li>
        )}
        {(z.offices ?? []).length > 0 && (
          <li>
            {fact(
              'Offices',
              <>
                <p className="flex flex-wrap gap-1.5">
                  {z.offices!.map((o) => (
                    <Chip key={o}>{o}</Chip>
                  ))}
                </p>
                <SourceNote url={z.offices_source} checked={checked} />
              </>,
            )}
          </li>
        )}
        {(z.investors ?? []).length > 0 && (
          <li>
            {fact(
              'Investors named on their page',
              <>
                <p className="flex flex-wrap gap-1.5">
                  {z.investors!.map((o) => (
                    <Chip key={o}>{o}</Chip>
                  ))}
                </p>
                <SourceNote url={z.investors_source} checked={checked} />
              </>,
            )}
          </li>
        )}
      </ul>
      {(z.leadership ?? []).length > 0 && (
        <Card variant="dense" as="section" aria-labelledby="zen-leaders">
          <h2 id="zen-leaders" className="mb-md text-lg font-semibold text-text">
            Leadership
          </h2>
          <ul className="card-grid">
            {z.leadership!.map((p) => (
              <li key={p.name} className="rounded-nested border border-border p-3">
                <p className="font-semibold text-text">{p.name}</p>
                <p className="text-sm text-text-muted">{p.title}</p>
              </li>
            ))}
          </ul>
          <div className="mt-md">
            <SourceNote url={z.leadership_source} checked={checked} />
          </div>
        </Card>
      )}
    </div>
  );
}
export function AboutZenotiPage() {
  return (
    <SectionGate id="about-zenoti">
      <AboutZenoti />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- The project

function ProjectSection() {
  const { content } = useZenotians();
  const p = content.project ?? {};
  useSeo(
    'The project · For Zenotians',
    p.intro?.slice(0, 200) || 'What the project is and how it works.',
  );
  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="The project"
        description="Four roles, one booking lifecycle, one policy file."
        breadcrumb={crumbs('The project')}
      />
      {p.intro && (
        <Card variant="dense" as="section" aria-label="What it does">
          <p className="max-w-[65ch] text-lg text-text">{p.intro}</p>
        </Card>
      )}
      <Card as="section" aria-labelledby="zen-roles" className="flex flex-col gap-md">
        <h2 id="zen-roles" className="text-xl font-semibold text-text">
          The four roles
        </h2>
        <LazyRolesDiagram roles={p.roles} />
        <ul className="card-grid">
          {(p.roles ?? []).map((r) => (
            <li key={r.role}>
              <Card variant="dense" className="h-full">
                <h3 className="mb-2 font-semibold text-text">{r.role}</h3>
                <Bullets items={r.does} className="text-sm" />
              </Card>
            </li>
          ))}
        </ul>
      </Card>
      <Card as="section" aria-labelledby="zen-life" className="flex flex-col gap-md">
        <h2 id="zen-life" className="text-xl font-semibold text-text">
          The booking lifecycle
        </h2>
        <LazyLifecycleDiagram />
      </Card>
      {(p.stack ?? []).length > 0 && (
        <Card variant="dense" as="section" aria-labelledby="zen-stack">
          <h2 id="zen-stack" className="mb-md text-xl font-semibold text-text">
            Tech stack
          </h2>
          <ul className="card-grid">
            {p.stack!.map((row) => (
              <li key={row.layer} className="flex flex-col gap-2">
                <h3 className="font-semibold text-text">{row.layer}</h3>
                <p className="flex flex-wrap gap-1.5">
                  {(row.items ?? []).map((i) => (
                    <Chip key={i}>{i}</Chip>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(p.security ?? []).length > 0 && (
        <Card variant="dense" as="section" aria-labelledby="zen-sec">
          <h2 id="zen-sec" className="mb-md text-xl font-semibold text-text">
            Security summary
          </h2>
          <Bullets items={p.security} />
        </Card>
      )}
    </div>
  );
}
export function ProjectPage() {
  return (
    <SectionGate id="project">
      <ProjectSection />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- How it maps to Zenoti

function Mapping() {
  const { content } = useZenotians();
  const rows = (content.mapping ?? []).filter((r) => r.workflow);
  useSeo(
    'How it maps to Zenoti · For Zenotians',
    'Common salon-software workflows, what Alankar built, and what it left out or simplified.',
  );
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="How it maps to Zenoti"
        description="Common salon-software workflows, and an honest account of what is built."
        breadcrumb={crumbs('How it maps to Zenoti')}
      />
      <Card variant="dense" padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Salon-software workflows compared with what Alankar built
          </caption>
          <thead>
            <tr className="border-b border-border text-text">
              <th scope="col" className="w-1/5 p-md font-semibold">
                Salon-software workflow
              </th>
              <th scope="col" className="w-2/5 p-md font-semibold">
                What Alankar built
              </th>
              <th scope="col" className="w-2/5 p-md font-semibold">
                Not built or simplified
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.workflow} className="border-b border-border align-top last:border-0">
                <th scope="row" className="p-md font-semibold text-text">
                  {row.workflow}
                </th>
                <td className="p-md text-text">{row.built}</td>
                <td className="p-md text-text-muted">{row.not_built}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-text-muted">
        The first column lists common workflows in salon software in general. Alankar makes no claim
        about how any particular product works inside.
      </p>
    </div>
  );
}
export function MappingPage() {
  return (
    <SectionGate id="mapping">
      <Mapping />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Engineering decisions

function Decisions() {
  const { content } = useZenotians();
  const items = (content.decisions ?? []).filter((d) => d.title);
  useSeo(
    'Engineering decisions · For Zenotians',
    'The choices that matter most, with the files they live in.',
  );
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Engineering decisions"
        description="Short notes on why, with where to find it in the code."
        breadcrumb={crumbs('Engineering decisions')}
      />
      <ol className="flex flex-col gap-md">
        {items.map((d, i) => (
          <li key={d.title}>
            <Card variant="dense" className="flex flex-col gap-2">
              <h2 className="flex items-baseline gap-3 text-lg font-semibold text-text">
                <span aria-hidden="true" className="text-primary-hover">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {d.title}
              </h2>
              <p className="max-w-[65ch] text-text">{d.body}</p>
              {(d.where ?? []).length > 0 && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  <span>Where:</span>
                  {d.where!.map((w) => (
                    <code
                      key={w}
                      className="rounded-nested bg-primary-soft px-2 py-0.5 text-xs text-text"
                    >
                      {w}
                    </code>
                  ))}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function DecisionsPage() {
  return (
    <SectionGate id="decisions">
      <Decisions />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Future vision

function VisionSection() {
  const { content } = useZenotians();
  const v = content.vision ?? {};
  const roles = (v.roles ?? []).filter((r) => r.role);
  useSeo(
    'Future vision, not built · For Zenotians',
    'A concept for optional AI assistants. Alankar uses no AI today.',
  );
  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Future vision, not built"
        description="Concept only."
        breadcrumb={crumbs('Future vision')}
      />
      <Card
        variant="dense"
        as="section"
        aria-label="Status of this section"
        className="border-2 border-dashed border-primary-light"
      >
        <p className="flex flex-wrap items-center gap-2 text-lg text-text">
          <Badge tone="warning">Concept, not built</Badge>
          {v.intro}
        </p>
      </Card>
      <Card as="section" aria-labelledby="zen-vo" className="flex flex-col gap-md">
        <h2 id="zen-vo" className="text-xl font-semibold text-text">
          All four roles together
        </h2>
        <LazyVisionOverviewDiagram roles={roles} />
        {v.overview_note && <p className="text-text-muted">{v.overview_note}</p>}
      </Card>
      {roles.map((r) => (
        <Card
          key={r.role}
          as="section"
          aria-label={`${r.role} flow`}
          className="flex flex-col gap-md"
        >
          <h2 className="text-xl font-semibold text-text">{r.role}</h2>
          <LazyFlowDiagram flow={r} />
        </Card>
      ))}
    </div>
  );
}
export function VisionPage() {
  return (
    <SectionGate id="vision">
      <VisionSection />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Try the demo

function Demo() {
  const { content } = useZenotians();
  const d = content.demo ?? {};
  useSeo('Try the demo · For Zenotians', 'Demo sign-ins for each role, with a short guide.');
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Try the demo"
        description="Sign in as each role and follow one visit through."
        breadcrumb={crumbs('Try the demo')}
        actions={<ButtonLink to="/login">Go to sign in</ButtonLink>}
      />
      <Card variant="dense" as="section" aria-label="Demo sign-ins">
        <ul className="card-grid">
          {(d.logins ?? []).map((l) => (
            <li key={l.role} className="rounded-nested border border-border p-3">
              <p className="font-semibold capitalize text-text">{l.role}</p>
              <dl className="mt-1 text-sm">
                <dt className="text-text-muted">Email</dt>
                <dd className="font-mono text-text">{l.email}</dd>
                <dt className="mt-1 text-text-muted">Password</dt>
                <dd className="font-mono text-text">{l.password}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Card>
      {(d.guide ?? []).length > 0 && (
        <Card variant="dense" as="section" aria-labelledby="zen-guide">
          <h2 id="zen-guide" className="mb-md text-lg font-semibold text-text">
            A short guide
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-text">
            {d.guide!.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </Card>
      )}
      <p className="text-sm text-text-muted">
        These are demo accounts with sample data. Payments and messages are simulated: nothing is
        charged and nothing is sent to a real person.
      </p>
    </div>
  );
}
export function DemoPage() {
  return (
    <SectionGate id="demo">
      <Demo />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Contact

function Contact() {
  const { content } = useZenotians();
  const contacts = publicContacts(content);
  const email = contacts.find((c) => c.key === 'email');
  useSeo('Contact · For Zenotians', 'How to reach me.');
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Contact"
        description="I am looking for a software or infrastructure role."
        breadcrumb={crumbs('Contact')}
        actions={
          email && (
            <a
              href={`mailto:${email.value}`}
              className={cn(buttonClasses('primary', 'md'), 'no-underline')}
            >
              <Mail className="h-4 w-4" aria-hidden="true" /> Email me
            </a>
          )
        }
      />
      <Card variant="dense" as="section" aria-label="Contact details">
        <ul className="card-grid">
          {contacts.map((c) => (
            <li key={c.key} className="rounded-nested border border-border p-3">
              <p className="text-sm text-text-muted">{c.label || CONTACT_LABEL[c.key]}</p>
              <p className="break-words font-medium text-text">
                {c.key === 'email' ? (
                  <a
                    className="text-primary-hover underline-offset-4 hover:underline"
                    href={`mailto:${c.value}`}
                  >
                    {c.value}
                  </a>
                ) : c.key === 'phone' ? (
                  <a
                    className="text-primary-hover underline-offset-4 hover:underline"
                    href={`tel:${c.value}`}
                  >
                    {c.value}
                  </a>
                ) : (
                  <Ext href={c.value}>
                    {c.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </Ext>
                )}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-text-muted">
        More about me is under{' '}
        <Link className="text-primary-hover underline" to={`${ROOT}/about/summary`}>
          About me
        </Link>
        .
      </p>
    </div>
  );
}
export function ContactPage() {
  return (
    <SectionGate id="contact">
      <Contact />
    </SectionGate>
  );
}
