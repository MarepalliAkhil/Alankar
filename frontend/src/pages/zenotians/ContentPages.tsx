import { Mail } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageContainer';
import { Card } from '../../components/ui';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { buttonClasses } from '../../components/ui/button-styles';
import { useSeo } from '../../hooks/useSeo';
import { cn } from '../../lib/cn';
import stats from '../../generated/repo-stats.json';
import { LazyLifecycleDiagram, LazyRolesDiagram } from './LazyDiagram';
import { useZenotians } from './context';
import { SectionGate } from './SectionGate';
import { Bullets, Chip, Ext, SourceNote, Where } from './parts';
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
  const limits = new Map((content.limitations?.items ?? []).map((item) => [item.id, item]));
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
      <Card
        variant="dense"
        padding="none"
        className="overflow-x-auto focus-visible:shadow-focus focus-visible:outline-none"
        role="region"
        aria-label="Workflow comparison table (scrolls sideways on small screens)"
        tabIndex={0}
      >
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
                Out of scope or simplified
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const found = (row.limits ?? []).flatMap((id) => {
                const item = limits.get(id);
                return item ? [item] : [];
              });
              return (
                <tr key={row.workflow} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="p-md font-semibold text-text">
                    {row.workflow}
                  </th>
                  <td className="p-md text-text">{row.built}</td>
                  <td className="p-md text-text-muted">
                    {found.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {found.map((item) => (
                          <li key={item.id}>
                            {item.out_of_scope}{' '}
                            <Link
                              className="whitespace-nowrap text-primary-hover underline-offset-4 hover:underline"
                              to={`${ROOT}/limitations#${item.id}`}
                            >
                              {item.area}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      row.not_built
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-text-muted">
        The first column lists common workflows in salon software in general. Alankar makes no claim
        about how any particular product works inside. The third column is written once, on the
        Limitations page, so the two never disagree.
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
              <Where items={d.where} />
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

// --------------------------------------------------------------------------- Quality evidence

function percent(hits: number, total: number): string {
  return `${((hits / total) * 100).toFixed(1)}%`;
}

function Quality() {
  const { content } = useZenotians();
  const q = content.quality ?? {};
  const accuracy = (q.accuracy ?? []).filter((m) => m.total > 0);
  const checks = (q.checks ?? []).filter((c) => c.title);
  useSeo(
    'Quality evidence · For Zenotians',
    'Test counts, measured chatbot accuracy and the checks behind the project.',
  );
  const counts = [
    {
      label: 'Automated tests',
      value: stats.automatedTests,
      note: 'all kinds, counted by a script',
    },
    { label: 'Backend tests', value: stats.testBreakdown.backend, note: 'pytest' },
    { label: 'Front-end unit tests', value: stats.testBreakdown.frontendUnit, note: 'Vitest' },
    { label: 'Browser tests', value: stats.testBreakdown.endToEnd, note: 'Playwright' },
    {
      label: 'Screens scanned by axe',
      value: stats.accessibilityScreens,
      note: 'WCAG 2.1 A and AA',
    },
  ];
  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Quality evidence"
        description="Numbers that can be checked, and what each one does not show."
        breadcrumb={crumbs('Quality evidence')}
      />
      {q.intro && <p className="max-w-[65ch] text-lg text-text">{q.intro}</p>}
      <section aria-labelledby="zen-q-counts">
        <h2 id="zen-q-counts" className="mb-md text-xl font-semibold text-text">
          What is tested
        </h2>
        <ul className="grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-5">
          {counts.map((n) => (
            <li key={n.label}>
              <Card variant="dense" className="flex h-full flex-col gap-1">
                <p className="tabular text-3xl font-semibold text-primary-hover">{n.value}</p>
                <p className="font-semibold text-text">{n.label}</p>
                <p className="text-sm text-text-muted">{n.note}</p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-sm text-sm text-text-muted">
          Counted from the repository by a script, not typed in. A count of tests says how much is
          checked, not that all of it is right.
        </p>
      </section>
      {accuracy.length > 0 && (
        <section aria-labelledby="zen-q-acc" className="flex flex-col gap-md">
          <h2 id="zen-q-acc" className="text-xl font-semibold text-text">
            Measured accuracy
          </h2>
          <ul className="grid gap-md md:grid-cols-2">
            {accuracy.map((m) => (
              <li key={m.name}>
                <Card variant="dense" className="flex h-full flex-col gap-2">
                  <h3 className="font-semibold text-text">{m.name}</h3>
                  <p className="tabular text-3xl font-semibold text-primary-hover">
                    {m.hits} of {m.total}
                    <span className="ml-2 text-lg font-medium text-text-muted">
                      {percent(m.hits, m.total)}
                    </span>
                  </p>
                  <progress
                    className="zen-meter h-2 w-full"
                    value={m.hits}
                    max={m.total}
                    aria-label={`${m.name}: ${m.hits} of ${m.total}`}
                  />
                  {m.how && <p className="text-text">{m.how}</p>}
                  {m.caveat && <p className="text-sm text-text-muted">{m.caveat}</p>}
                  {m.measured_on && (
                    <p className="text-sm text-text-muted">Measured on {m.measured_on}.</p>
                  )}
                  <Where items={m.where} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {checks.length > 0 && (
        <section aria-labelledby="zen-q-checks" className="flex flex-col gap-md">
          <h2 id="zen-q-checks" className="text-xl font-semibold text-text">
            How it is checked
          </h2>
          <ul className="flex flex-col gap-md">
            {checks.map((c) => (
              <li key={c.title}>
                <Card variant="dense" className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-text">{c.title}</h3>
                  <p className="max-w-[65ch] text-text">{c.detail}</p>
                  <Where items={c.where} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {q.verify_note && <p className="text-sm text-text-muted">{q.verify_note}</p>}
    </div>
  );
}
export function QualityPage() {
  return (
    <SectionGate id="quality">
      <Quality />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Security and privacy

function SecuritySection() {
  const { content } = useZenotians();
  const s = content.security ?? {};
  const items = (s.items ?? []).filter((i) => i.title);
  useSeo(
    'Security and privacy · For Zenotians',
    'Role isolation, sign-in, encryption, the audit log and data retention, with the files they live in.',
  );
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Security and privacy"
        description="What protects the system and the people in it."
        breadcrumb={crumbs('Security and privacy')}
      />
      {s.intro && <p className="max-w-[65ch] text-lg text-text">{s.intro}</p>}
      <ul className="grid gap-md lg:grid-cols-2">
        {items.map((item) => (
          <li key={item.title}>
            <Card variant="dense" className="flex h-full flex-col gap-2">
              <h2 className="text-lg font-semibold text-text">{item.title}</h2>
              <p className="max-w-[65ch] text-text">{item.body}</p>
              <Where items={item.where} />
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-sm text-text-muted">
        What this does not cover is listed on{' '}
        <Link className="text-primary-hover underline" to={`${ROOT}/limitations`}>
          Limitations
        </Link>
        .
      </p>
    </div>
  );
}
export function SecurityPage() {
  return (
    <SectionGate id="security">
      <SecuritySection />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Limitations

function LimitationsSection() {
  const { content } = useZenotians();
  const l = content.limitations ?? {};
  const items = (l.items ?? []).filter((i) => i.area);
  const { hash } = useLocation();
  useSeo(
    'Limitations · For Zenotians',
    'What the project does today and what is out of scope, each checked against the code.',
  );
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, items.length]);
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Limitations"
        description="What it does today, and what is out of scope."
        breadcrumb={crumbs('Limitations')}
      />
      {l.intro && <p className="max-w-[65ch] text-lg text-text">{l.intro}</p>}
      <ul className="flex flex-col gap-md">
        {items.map((item) => (
          <li key={item.id} id={item.id} className="scroll-mt-24">
            <Card variant="dense" className="flex flex-col gap-md">
              <h2 className="text-lg font-semibold text-text">{item.area}</h2>
              <div className="grid gap-md md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary-hover">
                    What it does today
                  </h3>
                  <p className="text-text">{item.today}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">
                    What is out of scope
                  </h3>
                  <p className="text-text">{item.out_of_scope}</p>
                </div>
              </div>
              <Where items={item.where} />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function LimitationsPage() {
  return (
    <SectionGate id="limitations">
      <LimitationsSection />
    </SectionGate>
  );
}

// --------------------------------------------------------------------------- Questions

function QuestionsSection() {
  const { content } = useZenotians();
  const f = content.questions ?? {};
  const items = (f.items ?? []).filter((i) => i.q && i.a);
  useSeo(
    'Questions you might ask me · For Zenotians',
    'Honest answers to the questions a reader is likely to ask about the project.',
  );
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="Questions you might ask me"
        description="Honest answers, with the code to check them against."
        breadcrumb={crumbs('Questions')}
      />
      {f.intro && <p className="max-w-[65ch] text-lg text-text">{f.intro}</p>}
      <ol className="flex flex-col gap-md">
        {items.map((item) => (
          <li key={item.q}>
            <Card variant="dense" className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-text">{item.q}</h2>
              <p className="max-w-[65ch] text-text">{item.a}</p>
              <Where items={item.where} />
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function QuestionsPage() {
  return (
    <SectionGate id="questions">
      <QuestionsSection />
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
