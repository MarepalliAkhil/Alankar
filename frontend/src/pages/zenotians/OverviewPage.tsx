import { brand } from '../../config/brand';
import { Download, Github, Headset, PlayCircle } from 'lucide-react';
import { Card } from '../../components/ui';
import { CountUp } from '../../components/ui/CountUp';
import stats from '../../generated/repo-stats.json';
import { Hero } from './Hero';
import { useZenotians } from './context';
import { ZenAccent, ZenHeadline } from './ZenHeadline';
import { SectionGate } from './SectionGate';
import { ROOT } from './model';
import { Bullets, Ext } from './parts';
import { buttonClasses } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';

const NUMBERS: { label: string; value: number; note: string }[] = [
  { label: 'Roles', value: stats.roles, note: 'customer, receptionist, stylist, admin' },
  { label: 'Pages', value: stats.pages, note: 'screens in the app' },
  { label: 'API endpoints', value: stats.apiEndpoints, note: 'routes on the server' },
  { label: 'Automated tests', value: stats.automatedTests, note: 'test functions' },
  {
    label: 'End-to-end tests',
    value: stats.testBreakdown.endToEnd,
    note: 'in a real browser, included above',
  },
  { label: 'Migrations', value: stats.migrations, note: 'database changes' },
];

function Overview() {
  const { content, goTo } = useZenotians();
  const o = content.overview ?? {};
  const external = (href: string, children: React.ReactNode, primary = false) => (
    <Ext
      href={href}
      className={cn(buttonClasses(primary ? 'primary' : 'secondary', 'md'), 'no-underline')}
    >
      {children}
    </Ext>
  );
  return (
    <div className="flex flex-col gap-lg">
      <Hero>
        <p className="text-sm font-semibold text-primary-hover">
          For Zenotians · {brand.platformName}
        </p>
        <ZenHeadline
          text={o.headline ?? ''}
          className="max-w-[26ch] text-3xl font-semibold text-text"
        />
        <ZenAccent />
        <div className="flex flex-wrap items-center gap-sm">
          <p className="max-w-[60ch] text-lg font-semibold text-text">
            Standout feature: AIR, an AI receptionist that covers the front desk when nobody is
            there.
          </p>
          <a
            href={`${ROOT}/air`}
            onClick={(event) => {
              if (!goTo || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              goTo('air');
            }}
            className={cn(buttonClasses('secondary', 'md'), 'no-underline')}
          >
            <Headset className="h-4 w-4" aria-hidden="true" /> Meet AIR
          </a>
        </div>
        {o.intro && <p className="max-w-[65ch] text-lg text-text-muted">{o.intro}</p>}
        <div className="flex flex-wrap gap-sm">
          {o.demo_url &&
            external(
              o.demo_url,
              <>
                <PlayCircle className="h-4 w-4" aria-hidden="true" /> Watch demo
              </>,
              true,
            )}
          {o.github_url &&
            external(
              o.github_url,
              <>
                <Github className="h-4 w-4" aria-hidden="true" /> View code on GitHub
              </>,
            )}
          {o.resume_pdf_url &&
            external(
              o.resume_pdf_url,
              <>
                <Download className="h-4 w-4" aria-hidden="true" /> Download resume
              </>,
            )}
        </div>
      </Hero>

      <section aria-labelledby="zen-numbers">
        <h2 id="zen-numbers" className="mb-md text-xl font-semibold text-text">
          The project in numbers
        </h2>
        {/* As many 180 px columns as fit; a label never breaks inside a word. */}
        <ul className="zen-numbers grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-md">
          {NUMBERS.map((n) => (
            <li key={n.label}>
              <Card variant="dense" className="flex h-full flex-col gap-1">
                <p className="text-3xl font-semibold text-primary-hover">
                  <CountUp value={n.value} startDelay={600} />
                </p>
                <p className="zen-number-label font-semibold text-text">{n.label}</p>
                <p className="zen-number-label text-sm text-text-muted">{n.note}</p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-sm text-sm text-text-muted">
          Counted from the repository by a script at build time, not typed in.
        </p>
      </section>

      {(o.start_here ?? []).length > 0 && (
        <Card variant="dense" as="section" aria-labelledby="zen-start">
          <h2 id="zen-start" className="mb-md text-xl font-semibold text-text">
            Start here
          </h2>
          <Bullets items={o.start_here} />
        </Card>
      )}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <SectionGate id="overview">
      <Overview />
    </SectionGate>
  );
}
