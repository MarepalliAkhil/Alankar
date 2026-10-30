import { Bell, Plus, Search, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PasswordInput,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  TabPanel,
  Tabs,
  useToast,
  type Column,
} from '../../components/ui';
import {
  ArtImage,
  BrandMark,
  DisplaySettings,
  FullScreenLoader,
  GlassButton,
  GlassCard,
  GlassDrawer,
  GlassInput,
  GlassModal,
  GlassNav,
  GlassPanel,
  SkeletonCard,
  SkeletonChart,
  SkeletonChat,
  SkeletonTable,
  Spinner,
  ThemeSwitcher,
} from '../../components/ui';
import { art, type ArtId } from '../../design/art';
import { contrastReport } from '../../design/contrast';
import { useTheme } from '../../design/theme-context';
import { ThemeScope } from '../../design/ThemeProvider';
import { MODES, THEMES, themeLabels, type Mode, type ThemeName } from '../../design/themes';
import { resolvedColors, type ColorToken } from '../../design/tokens';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { appointmentStatuses } from '../../types/appointment';

// Static class names so Tailwind generates every swatch; `satisfies` keeps it complete.
const swatches = {
  primary: 'bg-primary',
  primaryHover: 'bg-primary-hover',
  primaryLight: 'bg-primary-light',
  primarySoft: 'bg-primary-soft',
  onPrimary: 'bg-on-primary',
  text: 'bg-text',
  textMuted: 'bg-text-muted',
  background: 'bg-background',
  surface: 'bg-surface',
  surfaceMuted: 'bg-surface-muted',
  border: 'bg-border',
  accent: 'bg-accent',
  accentSoft: 'bg-accent-soft',
  onAccent: 'bg-on-accent',
  artOverlay: 'bg-art-overlay',
  photoOverlay: 'bg-photo-overlay',
  backdropOverlay: 'bg-backdrop-overlay',
  success: 'bg-success',
  successSoft: 'bg-success-soft',
  successText: 'bg-success-text',
  warning: 'bg-warning',
  warningSoft: 'bg-warning-soft',
  warningText: 'bg-warning-text',
  danger: 'bg-danger',
  dangerStrong: 'bg-danger-strong',
  dangerSoft: 'bg-danger-soft',
  dangerText: 'bg-danger-text',
  info: 'bg-info',
  infoSoft: 'bg-info-soft',
  infoText: 'bg-info-text',
  overlay: 'bg-overlay',
  focus: 'bg-focus',
  orbOne: 'bg-orb-one',
  orbTwo: 'bg-orb-two',
  orbThree: 'bg-orb-three',
} satisfies Record<ColorToken, string>;

interface DemoRow {
  id: string;
  guest: string;
  service: string;
  stylist: string;
  status: (typeof appointmentStatuses)[number];
}

// Sample rows for this developer page only (not shop content).
const demoRows: DemoRow[] = [
  { id: '1', guest: 'Ananya R.', service: 'Haircut', stylist: 'Rahul', status: 'scheduled' },
  { id: '2', guest: 'Vikram S.', service: 'Beard Trim', stylist: 'Arun', status: 'checked_in' },
  { id: '3', guest: 'Meera K.', service: 'Facial', stylist: 'Priya', status: 'in_progress' },
];

const demoColumns: Column<DemoRow>[] = [
  { key: 'guest', header: 'Guest', render: (row) => row.guest },
  { key: 'service', header: 'Service', render: (row) => row.service },
  { key: 'stylist', header: 'Stylist', render: (row) => row.stylist },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

const tabItems = [
  { id: 'one', label: 'Overview' },
  { id: 'two', label: 'Details' },
  { id: 'three', label: 'History' },
] as const;

function FilterChipsMode({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="group" aria-label="Preview mode" className="flex gap-sm">
      {MODES.map((m) => (
        <Button
          key={m}
          size="sm"
          variant={value === m ? 'primary' : 'secondary'}
          aria-pressed={value === m}
          onClick={() => onChange(m)}
        >
          {m === 'light' ? 'Light' : 'Dark'}
        </Button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" variant="dense" aria-label={title} className="flex flex-col gap-md">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {children}
    </Card>
  );
}

/** Developer page showing every base component, built only from tokens. Dev builds only. */
export default function DesignSystemPage() {
  useDocumentTitle('Design system');
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [glassDialog, setGlassDialog] = useState<'modal' | 'drawer' | null>(null);
  const [tab, setTab] = useState<(typeof tabItems)[number]['id']>('one');
  const [checked, setChecked] = useState(true);
  const [showTableEmpty, setShowTableEmpty] = useState(false);
  const display = useTheme();
  const [previewTheme, setPreviewTheme] = useState<ThemeName>('salon');
  const [previewMode, setPreviewMode] = useState<Mode>(display.mode);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const colors = resolvedColors(display.theme, display.mode);

  return (
    <PageContainer className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Developer"
        title="Design system"
        description="All tokens and base components. Pages may only use these."
      />

      <Section title="Themes and modes">
        <p className="text-sm text-text-muted">
          Five themes, each in light and dark. The page itself follows the display setting (top
          right); every panel below is a scoped preview. The number is the lowest WCAG contrast of
          all text pairs in that theme, glass over artwork included (AA needs 4.5).
        </p>
        <DisplaySettings />
        <ul className="grid gap-md sm:grid-cols-2 xl:grid-cols-5">
          {THEMES.flatMap((theme) =>
            MODES.map((mode) => {
              const rows = contrastReport(theme, mode);
              const worst = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
              return (
                <li key={`${theme}-${mode}`}>
                  <ThemeScope
                    theme={theme}
                    mode={mode}
                    className="flex h-full flex-col gap-sm rounded-card border border-border bg-background p-md text-text"
                  >
                    <p className="text-sm font-semibold">
                      {themeLabels[theme]} · {mode}
                    </p>
                    <div className="flex gap-1" aria-hidden="true">
                      {['bg-primary', 'bg-primary-hover', 'bg-accent', 'bg-surface', 'bg-text'].map(
                        (cls) => (
                          <span
                            key={cls}
                            className={`h-6 flex-1 rounded-input border border-border ${cls}`}
                          />
                        ),
                      )}
                    </div>
                    <GlassCard padding="sm" className="flex flex-col gap-xs">
                      <p className="text-sm">Glass card text</p>
                      <p className="text-xs text-text-muted">Secondary text</p>
                      <Button size="sm">Book now</Button>
                    </GlassCard>
                    <p className="text-xs text-text-muted">
                      Lowest contrast {worst.ratio.toFixed(2)}:1{' '}
                      {rows.every((r) => r.pass) ? '(all pass AA)' : '(FAILS)'}
                    </p>
                  </ThemeScope>
                </li>
              );
            }),
          )}
        </ul>
      </Section>

      <Section title="Contrast values">
        <ThemeSwitcher value={previewTheme} onChange={setPreviewTheme} />
        <FilterChipsMode value={previewMode} onChange={setPreviewMode} />
        <Table
          caption={`Contrast, ${themeLabels[previewTheme]}, ${previewMode} mode`}
          rows={contrastReport(previewTheme, previewMode)}
          rowKey={(row) => row.use}
          columns={[
            { key: 'use', header: 'Used for', render: (row) => row.use },
            { key: 'pair', header: 'Pair', render: (row) => `${row.fg} on ${row.bg}` },
            { key: 'ratio', header: 'Ratio', render: (row) => `${row.ratio.toFixed(2)}:1` },
            { key: 'min', header: 'Needs', render: (row) => `${row.min}:1` },
            {
              key: 'pass',
              header: 'Result',
              render: (row) => (
                <Badge tone={row.pass ? 'success' : 'danger'}>{row.pass ? 'Pass' : 'Fail'}</Badge>
              ),
            },
          ]}
        />
      </Section>

      <Section title="Glass components">
        <p className="text-sm text-text-muted">
          Shown in the {themeLabels[previewTheme]} theme over its artwork. Turn on &quot;Reduce
          transparency&quot; in the display settings to see the solid fallback.
        </p>
        <ThemeScope
          theme={previewTheme}
          mode={previewMode}
          className="relative overflow-hidden rounded-card text-text"
        >
          <ArtImage
            slot={
              previewTheme === 'spa'
                ? 'spaBackground'
                : previewTheme === 'parlor'
                  ? 'parlorBackground'
                  : 'salonBackground'
            }
            mode={previewMode}
            className="absolute inset-0 h-full w-full"
          />
          <div className="relative flex flex-col gap-md p-md sm:p-lg">
            <GlassNav label="Example navigation" className="flex items-center gap-sm px-md py-sm">
              <span className="font-semibold">Alankar</span>
              <span className="ml-auto text-sm text-text-muted">GlassNav</span>
            </GlassNav>
            <div className="grid gap-md md:grid-cols-2">
              <GlassCard interactive className="flex flex-col gap-sm">
                <p className="text-lg font-semibold">GlassCard</p>
                <p className="text-sm text-text-muted">
                  Light glass for content over artwork. Hover lifts it slightly.
                </p>
                <div className="flex flex-wrap gap-sm">
                  <Button size="sm">Primary</Button>
                  <GlassButton size="sm">GlassButton</GlassButton>
                  <GlassButton size="sm" onClick={() => setGlassDialog('modal')}>
                    Open GlassModal
                  </GlassButton>
                  <GlassButton size="sm" onClick={() => setGlassDialog('drawer')}>
                    Open GlassDrawer
                  </GlassButton>
                </div>
              </GlassCard>
              <GlassPanel className="flex flex-col gap-sm">
                <p className="text-lg font-semibold">GlassPanel</p>
                <GlassInput
                  label="GlassInput"
                  placeholder="Type here"
                  hint="Dense glass for forms"
                />
              </GlassPanel>
            </div>
          </div>
        </ThemeScope>
        <GlassModal
          open={glassDialog === 'modal'}
          onClose={() => setGlassDialog(null)}
          title="GlassModal"
          description="Dense glass, rises in; solid with reduced transparency."
          footer={<Button onClick={() => setGlassDialog(null)}>Close</Button>}
        >
          <p className="text-sm text-text">Focus is trapped here and Escape closes it.</p>
        </GlassModal>
        <GlassDrawer
          open={glassDialog === 'drawer'}
          onClose={() => setGlassDialog(null)}
          title="GlassDrawer"
          description="Dense glass, slides in from the right."
        >
          <p className="text-sm text-text">Full width on phones.</p>
        </GlassDrawer>
      </Section>

      <Section title="Loading">
        <div className="flex flex-wrap items-center gap-lg">
          {THEMES.map((theme) => (
            <ThemeScope
              key={theme}
              theme={theme}
              className="flex flex-col items-center gap-xs text-text"
            >
              <BrandMark theme={theme} className="h-14 w-14" />
              <span className="text-xs text-text-muted">{themeLabels[theme]}</span>
            </ThemeScope>
          ))}
          <Spinner label="Inline spinner" />
          <Button
            variant="secondary"
            onClick={() => {
              setLoaderOpen(true);
              window.setTimeout(() => setLoaderOpen(false), 2000);
            }}
          >
            Show the full-screen loader (2 s)
          </Button>
        </div>
        {loaderOpen && <FullScreenLoader label="Preview of the full-screen loader" />}
        <div className="grid gap-md lg:grid-cols-2">
          <SkeletonCard label="Card placeholder" />
          <SkeletonTable rows={3} label="Table placeholder" />
          <SkeletonChart label="Chart placeholder" />
          <SkeletonChat label="Chat placeholder" />
        </div>
      </Section>

      <Section title="Artwork">
        <p className="text-sm text-text-muted">
          Generated, original artwork. Put a photo named as shown in frontend/public/photos/ to
          replace a slot; the artwork stays as the fallback.
        </p>
        <ul className="grid gap-md md:grid-cols-3">
          {(Object.keys(art) as ArtId[]).map((id) => (
            <li key={id} className="flex flex-col gap-xs">
              <ArtImage slot={id} className="aspect-[8/5] w-full rounded-nested" />
              <p className="text-sm font-semibold text-text">{id}</p>
              <p className="text-xs text-text-muted">{art[id].description}</p>
              <p className="text-xs text-text-muted">
                Photo: public/photos/{art[id].photo}.webp / .jpg / .jpeg / .png · {art[id].width}×
                {art[id].height}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-sm sm:grid-cols-4 lg:grid-cols-6">
          {(Object.keys(swatches) as ColorToken[]).map((key) => (
            <li key={key} className="flex flex-col gap-1">
              <span className={`h-12 rounded-nested border border-border ${swatches[key]}`} />
              <span className="text-xs font-medium text-text">{key}</span>
              <span className="text-xs text-text-muted">{colors[key]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-sm">
          <Button onClick={() => toast.show({ title: 'Primary clicked', tone: 'success' })}>
            Primary
          </Button>
          <Button variant="secondary" onClick={() => toast.show({ title: 'Secondary clicked' })}>
            Secondary
          </Button>
          <Button variant="ghost" onClick={() => toast.show({ title: 'Ghost clicked' })}>
            Ghost
          </Button>
          <Button
            variant="danger"
            onClick={() => toast.show({ title: 'Danger clicked', tone: 'danger' })}
          >
            Danger
          </Button>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            size="sm"
            onClick={() => toast.show({ title: 'Small button' })}
          >
            With icon
          </Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <IconButton
            label="Search"
            icon={<Search className="h-5 w-5" />}
            onClick={() => toast.show({ title: 'Search clicked' })}
          />
          <IconButton
            label="Notifications"
            variant="soft"
            icon={<Bell className="h-5 w-5" />}
            onClick={() => toast.show({ title: 'Notifications clicked' })}
          />
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-md sm:grid-cols-2">
          <Input label="Full name" placeholder="Priya Sharma" hint="As on your ID." />
          <Input
            label="Email"
            type="email"
            defaultValue="not-an-email"
            error="Enter a valid email address."
          />
          <PasswordInput label="Password" defaultValue="secret-pass" />
          <Select
            label="Division"
            placeholder="Choose a division"
            options={[
              { value: 'salon', label: 'Salon' },
              { value: 'spa', label: 'Spa' },
              { value: 'beauty-parlor', label: 'Beauty Parlor' },
            ]}
          />
          <Checkbox
            label="Send me offers"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
        </div>
      </Section>

      <Section title="Badges and status">
        <div className="flex flex-wrap gap-sm">
          <Badge>Neutral</Badge>
          <Badge tone="primary" icon={<Sparkles className="h-3 w-3" />}>
            Primary
          </Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="info">Info</Badge>
        </div>
        <div className="flex flex-wrap gap-sm">
          {appointmentStatuses.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Avatars and cards">
        <div className="flex flex-wrap items-center gap-sm">
          <Avatar name="Rahul Verma" size="sm" />
          <Avatar name="Priya Sharma" />
          <Avatar name="Kiran" size="lg" />
        </div>
        <div className="grid gap-md sm:grid-cols-3">
          <Card>Glass card</Card>
          <Card variant="dense">Dense card</Card>
          <Card variant="plain">Plain card</Card>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs items={tabItems} value={tab} onChange={setTab} label="Demo tabs" idPrefix="demo" />
        <TabPanel idPrefix="demo" id={tab} className="text-sm text-text-muted">
          Selected tab: {tabItems.find((item) => item.id === tab)?.label}
        </TabPanel>
      </Section>

      <Section title="Table">
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTableEmpty((value) => !value)}
          >
            {showTableEmpty ? 'Show rows' : 'Show empty table'}
          </Button>
        </div>
        <Table
          caption="Demo appointments"
          columns={demoColumns}
          rows={showTableEmpty ? [] : demoRows}
          rowKey={(row) => row.id}
          emptyMessage="No appointments yet."
        />
      </Section>

      <Section title="Overlays and toasts">
        <div className="flex flex-wrap gap-sm">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.show({
                title: 'Saved',
                description: 'Your changes are saved.',
                tone: 'success',
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.show({
                title: 'Heads up',
                description: 'Slot is almost full.',
                tone: 'warning',
              })
            }
          >
            Warning toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.show({
                title: 'Payment failed',
                description: 'Please try again.',
                tone: 'danger',
              })
            }
          >
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-md lg:grid-cols-3">
          <Card variant="plain" padding="sm">
            <LoadingState label="Loading demo" />
          </Card>
          <Card variant="plain" padding="sm">
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Nothing here yet"
              description="Empty state with an action."
              action={
                <Button size="sm" onClick={() => toast.show({ title: 'Action clicked' })}>
                  Add item
                </Button>
              }
            />
          </Card>
          <Card variant="plain" padding="sm">
            <ErrorState onRetry={() => toast.show({ title: 'Retrying…' })} />
          </Card>
        </div>
        <div className="flex items-center gap-sm">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm booking"
        description="Assign the stylist and time for this request."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                toast.show({ title: 'Confirmed', tone: 'success' });
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">Modal content goes here. Press Escape to close.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Appointment details"
        description="Drawers slide in from the right."
        footer={<Button onClick={() => setDrawerOpen(false)}>Done</Button>}
      >
        <p className="text-sm text-text-muted">Drawer content goes here.</p>
      </Drawer>
    </PageContainer>
  );
}
