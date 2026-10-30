import type { ContactKey, ZenotiansContent } from '../../api/zenotians';

/** The sections of the For Zenotians page, in menu order. A section with no content is not here. */
export type SectionId =
  | 'overview'
  | 'about'
  | 'about-zenoti'
  | 'project'
  | 'mapping'
  | 'decisions'
  | 'vision'
  | 'demo'
  | 'contact';

export type AboutId =
  | 'summary'
  | 'education'
  | 'projects'
  | 'experience'
  | 'skills'
  | 'certifications'
  | 'achievements';

export interface MenuEntry {
  id: SectionId;
  label: string;
  path: string;
  children?: { id: AboutId; label: string; path: string }[];
}

export const ROOT = '/zenotians';

const filled = (value: string | undefined | null) => !!value?.trim();
const some = <T>(list: readonly T[] | undefined, keep: (item: T) => boolean = () => true) =>
  !!list && list.some(keep);

/** About-me items, in the resume's order. Achievements comes last and only when it has content. */
export function aboutItems(content: ZenotiansContent): MenuEntry['children'] {
  const r = content.resume ?? {};
  const items: { id: AboutId; label: string; has: boolean }[] = [
    { id: 'summary', label: 'Summary', has: filled(r.summary) },
    {
      id: 'education',
      label: 'Education',
      has: some(r.education, (e) => filled(e.school) || filled(e.program)),
    },
    { id: 'projects', label: 'Projects', has: some(r.projects, (p) => filled(p.title)) },
    {
      id: 'experience',
      label: 'Experience',
      has: some(r.experience, (e) => filled(e.role) || filled(e.org)),
    },
    {
      id: 'skills',
      label: 'Skills',
      has: some(r.skills, (s) => some(s.items, (i) => filled(i))),
    },
    {
      id: 'certifications',
      label: 'Certifications',
      has: some(r.certifications, (c) => filled(c.title)),
    },
    {
      id: 'achievements',
      label: 'Achievements',
      has: some(r.achievements, (a) => filled(a.title)),
    },
  ];
  return items
    .filter((i) => i.has)
    .map((i) => ({ id: i.id, label: i.label, path: `${ROOT}/about/${i.id}` }));
}

/** Contact fields the admin switched on for the public (the server already removes the others). */
export function publicContacts(content: ZenotiansContent) {
  return (content.resume?.contacts ?? []).filter((c) => c.public && filled(c.value));
}

export function zenotiConfigured(content: ZenotiansContent): boolean {
  const z = content.zenoti ?? {};
  return (
    filled(z.founded_text) ||
    filled(z.customers_text) ||
    some(z.leadership) ||
    some(z.offices) ||
    some(z.investors)
  );
}

export function projectConfigured(content: ZenotiansContent): boolean {
  const p = content.project ?? {};
  return filled(p.intro) || some(p.roles) || some(p.stack) || some(p.security);
}

export function visionConfigured(content: ZenotiansContent): boolean {
  const v = content.vision ?? {};
  return some(v.roles, (r) => filled(r.role));
}

/** The menu: every section that has something to show, nothing empty. */
export function buildMenu(content: ZenotiansContent): MenuEntry[] {
  const about = aboutItems(content) ?? [];
  const entries: (MenuEntry & { has: boolean })[] = [
    { id: 'overview', label: 'Overview', path: ROOT, has: filled(content.overview?.headline) },
    {
      id: 'about',
      label: 'About me',
      path: about.length > 0 ? about[0]!.path : `${ROOT}/about/summary`,
      children: about,
      has: about.length > 0,
    },
    {
      id: 'about-zenoti',
      label: 'About Zenoti',
      path: `${ROOT}/about-zenoti`,
      has: zenotiConfigured(content),
    },
    {
      id: 'project',
      label: 'The project',
      path: `${ROOT}/project`,
      has: projectConfigured(content),
    },
    {
      id: 'mapping',
      label: 'How it maps to Zenoti',
      path: `${ROOT}/mapping`,
      has: some(content.mapping, (m) => filled(m.workflow)),
    },
    {
      id: 'decisions',
      label: 'Engineering decisions',
      path: `${ROOT}/decisions`,
      has: some(content.decisions, (d) => filled(d.title)),
    },
    {
      id: 'vision',
      label: 'Future vision (AI assistants)',
      path: `${ROOT}/vision`,
      has: visionConfigured(content),
    },
    {
      id: 'demo',
      label: 'Try the demo',
      path: `${ROOT}/demo`,
      has: some(content.demo?.logins),
    },
    {
      id: 'contact',
      label: 'Contact',
      path: `${ROOT}/contact`,
      has: publicContacts(content).length > 0,
    },
  ];
  return entries.filter((e) => e.has).map((e) => ({ ...e, has: undefined }) as MenuEntry);
}

/** Whole years in business, computed from the founding year so it never goes stale. */
export function yearsSince(year: number, now: Date = new Date()): number {
  return Math.max(0, now.getFullYear() - year);
}

export const CONTACT_LABEL: Record<ContactKey, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  phone: 'Phone',
};

/** Links that leave the site always open with rel="noopener noreferrer". */
export const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function formatChecked(iso: string | null | undefined): string {
  return iso ?? '';
}
