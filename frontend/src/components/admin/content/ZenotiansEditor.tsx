import { useState } from 'react';
import type { ContentBlock } from '../../../api/content';
import type {
  Certification,
  Contact,
  ContactKey,
  Decision,
  DemoLogin,
  Education,
  Experience,
  FlowRole,
  MappingRow,
  Person,
  ResumeAchievement,
  ResumeProject,
  RoleInfo,
  SkillGroup,
  StackRow,
  ZenotiansContent,
} from '../../../api/zenotians';
import { buildMenu } from '../../../pages/zenotians/model';
import { Checkbox, Input, Select, Tabs, TabPanel, Textarea } from '../../ui';
import { BlockShell } from './BlockShell';
import { useBlockActions } from './useBlockActions';
import { LinesField, ListEditor } from './zen-editor-parts';

type Tab =
  'overview' | 'resume' | 'zenoti' | 'project' | 'mapping' | 'decisions' | 'vision' | 'demo';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'resume', label: 'Resume' },
  { id: 'zenoti', label: 'Zenoti facts' },
  { id: 'project', label: 'Project' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'vision', label: 'Future vision' },
  { id: 'demo', label: 'Demo logins' },
];
const CONTACT_OPTIONS = (['email', 'linkedin', 'github', 'portfolio', 'phone'] as const).map(
  (k) => ({ value: k, label: k }),
);
const DEMO_OPTIONS = (['customer', 'receptionist', 'stylist', 'admin'] as const).map((k) => ({
  value: k,
  label: k,
}));

/** Drop blank rows so the server only sees filled-in ones. */
function clean(content: ZenotiansContent): ZenotiansContent {
  const r = content.resume ?? {};
  return {
    ...content,
    resume: {
      ...r,
      contacts: (r.contacts ?? []).filter((c) => c.value.trim()),
    },
    zenoti: {
      ...content.zenoti,
      last_checked: content.zenoti?.last_checked || null,
      founded_year: content.zenoti?.founded_year || null,
      leadership: (content.zenoti?.leadership ?? []).filter(
        (p) => p.name?.trim() && p.title?.trim(),
      ),
    },
    demo: {
      ...content.demo,
      logins: (content.demo?.logins ?? []).filter((l) => l.email.trim() && l.password.trim()),
    },
  };
}

export function ZenotiansEditor({ block }: { block: ContentBlock<'zenotians'> }) {
  const saved: ZenotiansContent = (block.draft ?? block.published) as ZenotiansContent;
  const [c, setC] = useState<ZenotiansContent>(saved);
  const [tab, setTab] = useState<Tab>('overview');
  const actions = useBlockActions('zenotians');
  const set = <K extends keyof ZenotiansContent>(
    key: K,
    patch: Partial<NonNullable<ZenotiansContent[K]>>,
  ) => setC((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...patch } }));
  const resume = (patch: NonNullable<ZenotiansContent['resume']>) => set('resume', patch);
  const o = c.overview ?? {};
  const r = c.resume ?? {};
  const z = c.zenoti ?? {};
  const p = c.project ?? {};
  const v = c.vision ?? {};
  const d = c.demo ?? {};
  const menu = buildMenu(clean(c));

  return (
    <BlockShell
      block={block}
      title="For Zenotians page"
      description="Every section of the /zenotians page. A section with nothing in it is hidden from the menu."
      dirty={JSON.stringify(c) !== JSON.stringify(saved)}
      busy={actions.busy}
      problem={actions.problem}
      onSave={() => actions.save.mutate(clean(c) as never)}
      onDiscard={() => actions.discard.mutate()}
      onPublish={() => actions.publish.mutate()}
      onUnpublish={() => actions.unpublish.mutate()}
      preview={
        <div className="flex flex-col gap-sm text-sm">
          <p className="font-semibold text-text">Menu visitors will see</p>
          {menu.length === 0 ? (
            <p className="text-text-muted">Nothing yet: the page would show as not published.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-text-muted">
              {menu.map((m) => (
                <li key={m.id}>
                  {m.label}
                  {m.children ? ` (${m.children.map((x) => x.label).join(', ')})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      <Tabs
        items={TABS}
        value={tab}
        onChange={setTab}
        label="Zenotians page sections"
        idPrefix="zen-ed"
      />
      <TabPanel idPrefix="zen-ed" id={tab} className="flex flex-col gap-md">
        {tab === 'overview' && (
          <>
            <Input
              label="Headline"
              value={o.headline ?? ''}
              maxLength={160}
              onChange={(e) => set('overview', { headline: e.target.value })}
            />
            <Textarea
              label="Introduction"
              rows={4}
              maxLength={1500}
              value={o.intro ?? ''}
              onChange={(e) => set('overview', { intro: e.target.value })}
            />
            <LinesField
              label="Start here (one line each)"
              value={o.start_here}
              onChange={(lines) => set('overview', { start_here: lines })}
            />
            <Input
              label="Watch demo link"
              hint="Leave empty to hide the button."
              value={o.demo_url ?? ''}
              onChange={(e) => set('overview', { demo_url: e.target.value })}
            />
            <Input
              label="View code on GitHub link"
              hint="Leave empty to hide the button."
              value={o.github_url ?? ''}
              onChange={(e) => set('overview', { github_url: e.target.value })}
            />
            <Input
              label="Download resume link (PDF)"
              hint="Leave empty to hide the button."
              value={o.resume_pdf_url ?? ''}
              onChange={(e) => set('overview', { resume_pdf_url: e.target.value })}
            />
          </>
        )}
        {tab === 'resume' && (
          <>
            <Input
              label="Name"
              value={r.name ?? ''}
              onChange={(e) => resume({ name: e.target.value })}
            />
            <Input
              label="Location"
              value={r.location ?? ''}
              onChange={(e) => resume({ location: e.target.value })}
            />
            <Input
              label="Resume PDF link"
              hint="Shows a Download PDF button only when filled."
              value={r.pdf_url ?? ''}
              onChange={(e) => resume({ pdf_url: e.target.value })}
            />
            <Textarea
              label="Summary"
              rows={4}
              maxLength={1500}
              value={r.summary ?? ''}
              onChange={(e) => resume({ summary: e.target.value })}
            />
            <h3 className="font-semibold text-text">Contact details</h3>
            <p className="text-sm text-text-muted">
              Only fields with “Show publicly” on ever reach the public page.
            </p>
            <ListEditor<Contact>
              noun="contact field"
              max={8}
              items={r.contacts}
              onChange={(contacts) => resume({ contacts })}
              blank={() => ({ key: 'email', label: '', value: '', public: false })}
              render={(item, change) => (
                <>
                  <Select
                    label="Type"
                    options={CONTACT_OPTIONS}
                    value={item.key}
                    onChange={(e) => change({ key: e.target.value as ContactKey })}
                  />
                  <Input
                    label="Value"
                    value={item.value}
                    onChange={(e) => change({ value: e.target.value })}
                  />
                  <Checkbox
                    label="Show publicly"
                    checked={item.public}
                    onChange={(e) => change({ public: e.target.checked })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Education</h3>
            <ListEditor<Education>
              noun="school"
              max={8}
              items={r.education}
              onChange={(education) => resume({ education })}
              blank={() => ({})}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`School ${i + 1}`}
                    value={item.school ?? ''}
                    onChange={(e) => change({ school: e.target.value })}
                  />
                  <Input
                    label="Place"
                    value={item.place ?? ''}
                    onChange={(e) => change({ place: e.target.value })}
                  />
                  <Input
                    label="Period"
                    value={item.period ?? ''}
                    onChange={(e) => change({ period: e.target.value })}
                  />
                  <Input
                    label="Programme"
                    value={item.program ?? ''}
                    onChange={(e) => change({ program: e.target.value })}
                  />
                  <Input
                    label="Result"
                    hint="For example CGPA or marks. Empty hides it."
                    value={item.result ?? ''}
                    onChange={(e) => change({ result: e.target.value })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Projects</h3>
            <ListEditor<ResumeProject>
              noun="project"
              max={12}
              items={r.projects}
              onChange={(projects) => resume({ projects })}
              blank={() => ({ bullets: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Project ${i + 1} title`}
                    value={item.title ?? ''}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                  <Input
                    label="Code link"
                    value={item.url ?? ''}
                    onChange={(e) => change({ url: e.target.value })}
                  />
                  <Input
                    label="Tech stack"
                    hint="Comma separated. Empty hides it."
                    value={item.tech ?? ''}
                    onChange={(e) => change({ tech: e.target.value })}
                  />
                  <Input
                    label="Note"
                    hint="For example Hackathon project."
                    value={item.note ?? ''}
                    onChange={(e) => change({ note: e.target.value })}
                  />
                  <LinesField
                    label="What I did"
                    value={item.bullets}
                    onChange={(bullets) => change({ bullets })}
                  />
                  <Input
                    label="Outcome"
                    hint="Empty hides it."
                    value={item.outcome ?? ''}
                    onChange={(e) => change({ outcome: e.target.value })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Experience</h3>
            <ListEditor<Experience>
              noun="role"
              max={12}
              items={r.experience}
              onChange={(experience) => resume({ experience })}
              blank={() => ({ bullets: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Role ${i + 1}`}
                    value={item.role ?? ''}
                    onChange={(e) => change({ role: e.target.value })}
                  />
                  <Input
                    label="Organisation"
                    value={item.org ?? ''}
                    onChange={(e) => change({ org: e.target.value })}
                  />
                  <Input
                    label="Period"
                    value={item.period ?? ''}
                    onChange={(e) => change({ period: e.target.value })}
                  />
                  <LinesField
                    label="What I did"
                    value={item.bullets}
                    onChange={(bullets) => change({ bullets })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Skills</h3>
            <ListEditor<SkillGroup>
              noun="skill group"
              max={12}
              items={r.skills}
              onChange={(skills) => resume({ skills })}
              blank={() => ({ items: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Group ${i + 1}`}
                    value={item.group ?? ''}
                    onChange={(e) => change({ group: e.target.value })}
                  />
                  <LinesField
                    label="Skills"
                    value={item.items}
                    onChange={(items) => change({ items })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Certifications</h3>
            <ListEditor<Certification>
              noun="certification"
              max={16}
              items={r.certifications}
              onChange={(certifications) => resume({ certifications })}
              blank={() => ({})}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Certification ${i + 1}`}
                    value={item.title ?? ''}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                  <Input
                    label="Detail"
                    value={item.detail ?? ''}
                    onChange={(e) => change({ detail: e.target.value })}
                  />
                  <Input
                    label="Link"
                    value={item.url ?? ''}
                    onChange={(e) => change({ url: e.target.value })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Achievements</h3>
            <p className="text-sm text-text-muted">
              The Achievements item appears in the menu only when there is at least one.
            </p>
            <ListEditor<ResumeAchievement>
              noun="achievement"
              max={12}
              items={r.achievements}
              onChange={(achievements) => resume({ achievements })}
              blank={() => ({})}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Achievement ${i + 1}`}
                    value={item.title ?? ''}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                  <Input
                    label="Detail"
                    value={item.detail ?? ''}
                    onChange={(e) => change({ detail: e.target.value })}
                  />
                </>
              )}
            />
          </>
        )}
        {tab === 'zenoti' && (
          <>
            <p className="text-sm text-text-muted">
              Only public facts from Zenoti’s own site. Every fact needs its source link.
            </p>
            <Input
              label="Section label"
              value={z.label ?? ''}
              onChange={(e) => set('zenoti', { label: e.target.value })}
            />
            <Input
              label="Last checked"
              type="date"
              value={z.last_checked ?? ''}
              onChange={(e) => set('zenoti', { last_checked: e.target.value })}
            />
            <Input
              label="Founded year"
              type="number"
              value={z.founded_year ?? ''}
              onChange={(e) =>
                set('zenoti', { founded_year: e.target.value ? Number(e.target.value) : null })
              }
            />
            <Textarea
              label="Founded text"
              rows={2}
              value={z.founded_text ?? ''}
              onChange={(e) => set('zenoti', { founded_text: e.target.value })}
            />
            <Input
              label="Founded source link"
              value={z.founded_source ?? ''}
              onChange={(e) => set('zenoti', { founded_source: e.target.value })}
            />
            <Input
              label="Customers text"
              value={z.customers_text ?? ''}
              onChange={(e) => set('zenoti', { customers_text: e.target.value })}
            />
            <Input
              label="Customers note"
              value={z.customers_note ?? ''}
              onChange={(e) => set('zenoti', { customers_note: e.target.value })}
            />
            <Input
              label="Customers source link"
              value={z.customers_source ?? ''}
              onChange={(e) => set('zenoti', { customers_source: e.target.value })}
            />
            <LinesField
              label="Offices"
              value={z.offices}
              onChange={(offices) => set('zenoti', { offices })}
            />
            <Input
              label="Offices source link"
              value={z.offices_source ?? ''}
              onChange={(e) => set('zenoti', { offices_source: e.target.value })}
            />
            <LinesField
              label="Investors named on their page"
              value={z.investors}
              onChange={(investors) => set('zenoti', { investors })}
            />
            <Input
              label="Investors source link"
              value={z.investors_source ?? ''}
              onChange={(e) => set('zenoti', { investors_source: e.target.value })}
            />
            <h3 className="font-semibold text-text">Leadership (name and title only)</h3>
            <ListEditor<Person>
              noun="person"
              max={20}
              items={z.leadership}
              onChange={(leadership) => set('zenoti', { leadership })}
              blank={() => ({ name: '', title: '' })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Name ${i + 1}`}
                    value={item.name}
                    onChange={(e) => change({ name: e.target.value })}
                  />
                  <Input
                    label="Title"
                    value={item.title}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </>
              )}
            />
            <Input
              label="Leadership source link"
              value={z.leadership_source ?? ''}
              onChange={(e) => set('zenoti', { leadership_source: e.target.value })}
            />
          </>
        )}
        {tab === 'project' && (
          <>
            <Textarea
              label="What it does"
              rows={5}
              maxLength={1500}
              value={p.intro ?? ''}
              onChange={(e) => set('project', { intro: e.target.value })}
            />
            <h3 className="font-semibold text-text">Roles</h3>
            <ListEditor<RoleInfo>
              noun="role"
              max={6}
              items={p.roles}
              onChange={(roles) => set('project', { roles })}
              blank={() => ({ does: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Role ${i + 1}`}
                    value={item.role ?? ''}
                    onChange={(e) => change({ role: e.target.value })}
                  />
                  <LinesField
                    label="What this role does"
                    value={item.does}
                    onChange={(does) => change({ does })}
                  />
                </>
              )}
            />
            <h3 className="font-semibold text-text">Tech stack</h3>
            <ListEditor<StackRow>
              noun="layer"
              max={10}
              items={p.stack}
              onChange={(stack) => set('project', { stack })}
              blank={() => ({ items: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Layer ${i + 1}`}
                    value={item.layer ?? ''}
                    onChange={(e) => change({ layer: e.target.value })}
                  />
                  <LinesField
                    label="Items"
                    value={item.items}
                    onChange={(items) => change({ items })}
                  />
                </>
              )}
            />
            <LinesField
              label="Security summary"
              rows={5}
              value={p.security}
              onChange={(security) => set('project', { security })}
            />
          </>
        )}
        {tab === 'mapping' && (
          <ListEditor<MappingRow>
            noun="workflow"
            max={20}
            items={c.mapping}
            onChange={(mapping) => setC((prev) => ({ ...prev, mapping }))}
            blank={() => ({})}
            render={(item, change, i) => (
              <>
                <Input
                  label={`Workflow ${i + 1}`}
                  value={item.workflow ?? ''}
                  onChange={(e) => change({ workflow: e.target.value })}
                />
                <Textarea
                  label="What Alankar built"
                  rows={3}
                  value={item.built ?? ''}
                  onChange={(e) => change({ built: e.target.value })}
                />
                <Textarea
                  label="Not built or simplified"
                  rows={2}
                  value={item.not_built ?? ''}
                  onChange={(e) => change({ not_built: e.target.value })}
                />
              </>
            )}
          />
        )}
        {tab === 'decisions' && (
          <ListEditor<Decision>
            noun="decision"
            max={10}
            items={c.decisions}
            onChange={(decisions) => setC((prev) => ({ ...prev, decisions }))}
            blank={() => ({ where: [] })}
            render={(item, change, i) => (
              <>
                <Input
                  label={`Decision ${i + 1}`}
                  value={item.title ?? ''}
                  onChange={(e) => change({ title: e.target.value })}
                />
                <Textarea
                  label="Why"
                  rows={4}
                  value={item.body ?? ''}
                  onChange={(e) => change({ body: e.target.value })}
                />
                <LinesField
                  label="Where in the code"
                  hint="One file path per line."
                  value={item.where}
                  onChange={(where) => change({ where })}
                />
              </>
            )}
          />
        )}
        {tab === 'vision' && (
          <>
            <Textarea
              label="Opening statement"
              hint="Must say that Alankar uses no AI today and that this is a concept."
              rows={3}
              value={v.intro ?? ''}
              onChange={(e) => set('vision', { intro: e.target.value })}
            />
            <Input
              label="Note under the overview picture"
              value={v.overview_note ?? ''}
              onChange={(e) => set('vision', { overview_note: e.target.value })}
            />
            <ListEditor<FlowRole>
              noun="role flow"
              max={6}
              items={v.roles}
              onChange={(roles) => set('vision', { roles })}
              blank={() => ({ data_in: [], today: [], future: [], guardrails: [] })}
              render={(item, change, i) => (
                <>
                  <Input
                    label={`Role ${i + 1}`}
                    value={item.role ?? ''}
                    onChange={(e) => change({ role: e.target.value })}
                  />
                  <LinesField
                    label="Data in"
                    value={item.data_in}
                    onChange={(data_in) => change({ data_in })}
                  />
                  <LinesField
                    label="Today (no AI)"
                    value={item.today}
                    onChange={(today) => change({ today })}
                  />
                  <LinesField
                    label="Possible future layer"
                    value={item.future}
                    onChange={(future) => change({ future })}
                  />
                  <LinesField
                    label="Guardrails"
                    value={item.guardrails}
                    onChange={(guardrails) => change({ guardrails })}
                  />
                </>
              )}
            />
          </>
        )}
        {tab === 'demo' && (
          <>
            <p className="text-sm text-text-muted">
              The Try the demo section appears only when at least one login is filled in. Use demo
              accounts only: the address must end in example.com. Never enter a real password.
            </p>
            <ListEditor<DemoLogin>
              noun="demo login"
              max={8}
              items={d.logins}
              onChange={(logins) => set('demo', { logins })}
              blank={() => ({ role: 'customer', email: '', password: '' })}
              render={(item, change) => (
                <>
                  <Select
                    label="Role"
                    options={DEMO_OPTIONS}
                    value={item.role}
                    onChange={(e) => change({ role: e.target.value as DemoLogin['role'] })}
                  />
                  <Input
                    label="Email"
                    value={item.email}
                    onChange={(e) => change({ email: e.target.value })}
                  />
                  <Input
                    label="Password"
                    value={item.password}
                    onChange={(e) => change({ password: e.target.value })}
                  />
                </>
              )}
            />
            <LinesField
              label="Short guide (one step per line)"
              value={d.guide}
              onChange={(guide) => set('demo', { guide })}
            />
          </>
        )}
      </TabPanel>
    </BlockShell>
  );
}
