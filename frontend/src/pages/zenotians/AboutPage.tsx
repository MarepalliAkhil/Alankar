import { Download, Github, Linkedin, Mail, MapPin, Globe, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageContainer';
import { Badge, Card } from '../../components/ui';
import { buttonClasses } from '../../components/ui/button-styles';
import { DropdownMenu } from '../../components/ui/DropdownMenu';
import { useSeo } from '../../hooks/useSeo';
import { cn } from '../../lib/cn';
import { useZenotians } from './context';
import { SectionGate } from './SectionGate';
import { Bullets, Chip, Ext, Timeline, TimelineItem } from './parts';
import { CONTACT_LABEL, ROOT, aboutItems, publicContacts, type AboutId } from './model';

const CONTACT_ICON = {
  email: Mail,
  linkedin: Linkedin,
  github: Github,
  portfolio: Globe,
  phone: Phone,
} as const;

const TITLES: Record<AboutId, { title: string; description: string }> = {
  summary: { title: 'Summary', description: 'Who I am and the work I am looking for.' },
  education: { title: 'Education', description: 'Where I studied, newest first.' },
  projects: { title: 'Projects', description: 'Things I built, with links to the code.' },
  experience: { title: 'Experience', description: 'Internships and where I worked.' },
  skills: { title: 'Skills', description: 'The tools and subjects I work with.' },
  certifications: { title: 'Certifications', description: 'Courses and exams I completed.' },
  achievements: { title: 'Achievements', description: 'Highlights worth knowing about.' },
};

function Header() {
  const { content } = useZenotians();
  const r = content.resume ?? {};
  const contacts = publicContacts(content);
  return (
    <Card as="section" aria-label="Contact details" className="flex flex-col gap-md">
      <div>
        <p className="text-2xl font-semibold tracking-wide text-text">{r.name}</p>
        {r.location && (
          <p className="mt-1 flex items-center gap-1 text-text-muted">
            <MapPin className="h-4 w-4" aria-hidden="true" /> {r.location}
          </p>
        )}
      </div>
      {contacts.length > 0 && (
        <ul className="flex flex-wrap gap-sm">
          {contacts.map((c) => {
            const Icon = CONTACT_ICON[c.key];
            const label = c.label || CONTACT_LABEL[c.key];
            const href =
              c.key === 'email'
                ? `mailto:${c.value}`
                : c.key === 'phone'
                  ? `tel:${c.value}`
                  : c.value;
            const inner = (
              <>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </>
            );
            return (
              <li key={c.key}>
                {c.key === 'email' || c.key === 'phone' ? (
                  <a
                    href={href}
                    className={cn(buttonClasses('secondary', 'sm'), 'no-underline')}
                    aria-label={`${label}: ${c.value}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <Ext href={href} className={cn(buttonClasses('secondary', 'sm'), 'no-underline')}>
                    {inner}
                  </Ext>
                )}
              </li>
            );
          })}
          {r.pdf_url && (
            <li className="no-print">
              <Ext href={r.pdf_url} className={cn(buttonClasses('primary', 'sm'), 'no-underline')}>
                <Download className="h-4 w-4" aria-hidden="true" /> Download PDF
              </Ext>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function Body({ id }: { id: AboutId }) {
  const { content } = useZenotians();
  const r = content.resume ?? {};
  switch (id) {
    case 'summary':
      return (
        <div className="flex flex-col gap-md">
          <Header />
          <Card variant="dense" as="section" aria-label="Summary">
            <p className="max-w-[65ch] text-lg text-text">{r.summary}</p>
          </Card>
        </div>
      );
    case 'education':
      return (
        <Timeline>
          {(r.education ?? []).map((e) => (
            <TimelineItem
              key={`${e.school}-${e.period}`}
              period={e.period}
              title={e.school ?? ''}
              subtitle={[e.program, e.place].filter(Boolean).join(' · ')}
            >
              {e.result && (
                <Badge tone="primary" className="self-start">
                  {e.result}
                </Badge>
              )}
            </TimelineItem>
          ))}
        </Timeline>
      );
    case 'projects':
      return (
        <ul className="card-grid">
          {(r.projects ?? []).map((p) => (
            <li key={p.title}>
              <Card variant="dense" className="flex h-full flex-col gap-3">
                {p.note && (
                  <Badge tone="info" className="self-start">
                    {p.note}
                  </Badge>
                )}
                <h2 className="text-lg font-semibold text-text">{p.title}</h2>
                {p.tech && (
                  <p className="flex flex-wrap gap-1.5">
                    {p.tech.split(',').map((t) => (
                      <Chip key={t}>{t.trim()}</Chip>
                    ))}
                  </p>
                )}
                <Bullets items={p.bullets} className="text-sm" />
                {p.outcome && <p className="text-sm text-text">{p.outcome}</p>}
                {p.url && (
                  <div className="mt-auto pt-2">
                    <Ext
                      href={p.url}
                      className={cn(buttonClasses('secondary', 'sm'), 'no-underline')}
                    >
                      <Github className="h-4 w-4" aria-hidden="true" /> View the code
                    </Ext>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      );
    case 'experience':
      return (
        <Timeline>
          {(r.experience ?? []).map((e) => (
            <TimelineItem
              key={`${e.role}-${e.period}`}
              period={e.period}
              title={e.role ?? ''}
              subtitle={e.org}
            >
              <Bullets items={e.bullets} className="text-sm" />
            </TimelineItem>
          ))}
        </Timeline>
      );
    case 'skills':
      return (
        <ul className="card-grid">
          {(r.skills ?? []).map((g) => (
            <li key={g.group}>
              <Card variant="dense" className="flex h-full flex-col gap-3">
                <h2 className="text-lg font-semibold text-text">{g.group}</h2>
                <p className="flex flex-wrap gap-1.5">
                  {(g.items ?? []).map((item) => (
                    <Chip key={item}>{item}</Chip>
                  ))}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      );
    case 'certifications':
      return (
        <ul className="card-grid">
          {(r.certifications ?? []).map((c) => (
            <li key={c.title}>
              <Card variant="dense" className="flex h-full flex-col gap-2">
                <h2 className="text-lg font-semibold text-text">{c.title}</h2>
                {c.detail && <p className="text-text-muted">{c.detail}</p>}
                {c.url && (
                  <div className="mt-auto pt-2">
                    <Ext
                      href={c.url}
                      className={cn(buttonClasses('secondary', 'sm'), 'no-underline')}
                    >
                      View certificate
                    </Ext>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      );
    case 'achievements':
      return (
        <ul className="card-grid">
          {(r.achievements ?? []).map((a) => (
            <li key={a.title}>
              <Card variant="dense" className="flex h-full flex-col gap-2">
                <h2 className="text-lg font-semibold text-text">{a.title}</h2>
                {a.detail && <p className="text-text-muted">{a.detail}</p>}
              </Card>
            </li>
          ))}
        </ul>
      );
  }
}

function About({ id }: { id: AboutId }) {
  const { content } = useZenotians();
  const items = aboutItems(content) ?? [];
  const { title, description } = TITLES[id];
  useSeo(`${title} · About me · For Zenotians`, description);
  if (!items.some((i) => i.id === id)) return <GateRedirect />;
  const current = items.find((i) => i.id === id)!;
  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title={title}
        description={description}
        breadcrumb={[
          { label: 'For Zenotians', to: ROOT },
          { label: 'About me', to: items[0]?.path },
          { label: title },
        ]}
        actions={
          <div className="lg:hidden zen-noprint">
            <DropdownMenu
              label="About me sections"
              trigger={<span className="px-3">About me: {current.label}</span>}
              items={items.map((i) => ({ label: i.label, to: i.path }))}
            />
          </div>
        }
      />
      <Body id={id} />
    </div>
  );
}

function GateRedirect(): ReactNode {
  return <Navigate to={ROOT} replace />;
}

export default function AboutPage({ id }: { id: AboutId }) {
  return (
    <SectionGate id="about">
      <About id={id} />
    </SectionGate>
  );
}
