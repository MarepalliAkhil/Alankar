import type { ContactKey, ZenotiansContent } from '../../api/zenotians';

/** The sections of the For Zenotians page, in menu order. A section with no content is not here. */
export type SectionId =
  | 'overview'
  | 'about'
  | 'about-zenoti'
  | 'project'
  | 'air'
  | 'ai-intelligence'
  | 'mapping'
  | 'day'
  | 'quality'
  | 'security'
  | 'limitations'
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

export const ROOT = '/for-zenotians';

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

export function storyConfigured(content: ZenotiansContent): boolean {
  return some(content.story?.chapters, (c) => filled(c.title) && filled(c.body));
}

export function qualityConfigured(content: ZenotiansContent): boolean {
  const q = content.quality ?? {};
  return some(q.accuracy, (m) => m.total > 0) || some(q.checks, (c) => filled(c.title));
}

export function securityConfigured(content: ZenotiansContent): boolean {
  return some(content.security?.items, (i) => filled(i.title));
}

export function limitationsConfigured(content: ZenotiansContent): boolean {
  return some(content.limitations?.items, (i) => filled(i.area));
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
      id: 'day',
      label: 'A day at Alankar',
      path: `${ROOT}/day`,
      has: storyConfigured(content),
    },
    {
      id: 'project',
      label: 'The project',
      path: `${ROOT}/project`,
      has: projectConfigured(content),
    },
    // Built features described by the page itself (pages/zenotians/ai-sections.tsx), so always on.
    { id: 'air', label: 'AIR, the AI receptionist', path: `${ROOT}/air`, has: true },
    {
      id: 'ai-intelligence',
      label: 'AI Alankar Intelligence',
      path: `${ROOT}/ai-intelligence`,
      has: true,
    },
    {
      id: 'mapping',
      label: 'How it maps to Zenoti',
      path: `${ROOT}/mapping`,
      has: some(content.mapping, (m) => filled(m.workflow)),
    },
    {
      id: 'quality',
      label: 'Quality evidence',
      path: `${ROOT}/quality`,
      has: qualityConfigured(content),
    },
    {
      id: 'security',
      label: 'Security and privacy',
      path: `${ROOT}/security`,
      has: securityConfigured(content),
    },
    {
      id: 'limitations',
      label: 'Limitations',
      path: `${ROOT}/limitations`,
      has: limitationsConfigured(content),
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
  const shown = entries.filter((e) => e.has).map((e) => ({ ...e, has: undefined }) as MenuEntry);
  // An unpublished page (no content at all) stays unpublished: the two built-in sections do not
  // publish it on their own.
  return shown.some((e) => e.id !== 'air' && e.id !== 'ai-intelligence') ? shown : [];
}

export interface MenuGroup {
  id: 'start' | 'about' | 'project' | 'end';
  /** Sentence-case heading, or null for a group without one. */
  heading: string | null;
  entries: MenuEntry[];
}

/** Which group each section belongs to. The order inside a group is the menu order. */
const GROUP_OF: Record<SectionId, MenuGroup['id']> = {
  overview: 'start',
  about: 'about',
  'about-zenoti': 'about',
  day: 'project',
  project: 'project',
  air: 'project',
  'ai-intelligence': 'project',
  mapping: 'project',
  quality: 'project',
  security: 'project',
  limitations: 'project',
  demo: 'end',
  contact: 'end',
};

const GROUP_HEADING: Record<MenuGroup['id'], string | null> = {
  start: null,
  about: 'About',
  project: 'The project',
  end: null,
};

/** The menu under its headings. A group whose sections are all hidden is not here. */
export function groupMenu(menu: MenuEntry[]): MenuGroup[] {
  return (['start', 'about', 'project', 'end'] as const)
    .map((id) => ({
      id,
      heading: GROUP_HEADING[id],
      entries: menu.filter((entry) => GROUP_OF[entry.id] === id),
    }))
    .filter((group) => group.entries.length > 0);
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

/** Where an address points inside the one For Zenotians page: a section and, for About me, an
 * item. Unknown or hidden sections give null (the page then starts at the top). */
export function targetForPath(
  menu: MenuEntry[],
  pathname: string,
): { section: SectionId; item?: AboutId } | null {
  const rest = pathname.replace(/\/+$/, '').slice(ROOT.length).replace(/^\//, '');
  if (!rest) return menu.some((e) => e.id === 'overview') ? { section: 'overview' } : null;
  const [first, second] = rest.split('/');
  if (first === 'about') {
    const about = menu.find((e) => e.id === 'about');
    if (!about) return null;
    const item = about.children?.find((c) => c.id === second) ?? about.children?.[0];
    return item ? { section: 'about', item: item.id } : { section: 'about' };
  }
  const entry = menu.find((e) => e.id === first);
  return entry ? { section: entry.id } : null;
}

/** DOM ids of the sections and of the About me items (scroll targets). */
export const sectionDomId = (id: SectionId) => `zen-sec-${id}`;
export const aboutDomId = (id: AboutId) => `zen-about-${id}`;
