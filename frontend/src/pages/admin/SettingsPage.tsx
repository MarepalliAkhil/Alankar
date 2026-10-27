import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  getSettings,
  saveSettings,
  type BusinessSettings,
  type SettingsPatch,
} from '../../api/adminOps';
import { WEEKDAYS, type Weekday } from '../../api/admin';
import { errorDetail, serverFieldErrors } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  Checkbox,
  ErrorState,
  Input,
  LoadingState,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const dayNames: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Admin: business settings. Each section saves on its own and is audited with old and new. */
export default function SettingsPage() {
  useDocumentTitle('Settings');
  const settings = useQuery({ queryKey: ['business-settings'], queryFn: getSettings });
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Shop details, opening hours, booking and billing rules, security and the rating bands that set stylist pay. Every change is recorded with the old and new value. The audit log and security page arrive in Task 5d."
      />
      {settings.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading settings…" />
        </Card>
      ) : settings.isError ? (
        <Card variant="dense">
          <ErrorState
            description="We couldn't load the settings."
            onRetry={() => void settings.refetch()}
          />
        </Card>
      ) : (
        <>
          <ShopSection value={settings.data.shop} />
          <HoursSection value={settings.data.hours.weekly_hours} />
          <BookingSection value={settings.data.booking} />
          <BillingSection value={settings.data.billing} />
          <SecuritySection value={settings.data.security} />
          <RatingSection value={settings.data.rating} />
        </>
      )}
    </div>
  );
}

/** Shared save plumbing: one section, one button, one message. */
function useSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => saveSettings(patch),
    onSuccess: (data) => {
      setProblem('');
      setFields({});
      queryClient.setQueryData(['business-settings'], data);
      toast.show({ tone: 'success', title: 'Settings saved' });
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length > 0
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save. Please try again.'),
      );
    },
  });
  return { save, problem, setProblem, fields };
}

function Section({
  id,
  title,
  description,
  children,
  onSubmit,
  pending,
  problem,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
  problem: string;
}) {
  return (
    <Card variant="dense" as="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-text">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      <form noValidate onSubmit={onSubmit} className="mt-md flex flex-col gap-md">
        {children}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div>
          <Button type="submit" loading={pending}>
            Save {title.toLowerCase()}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function nested(fields: Record<string, string>, key: string): string | undefined {
  return fields[key] ?? undefined;
}

// ------------------------------------------------------------------------------------ shop

function ShopSection({ value }: { value: BusinessSettings['shop'] }) {
  const [form, setForm] = useState(value);
  const { save, problem, setProblem, fields } = useSection();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return setProblem('Enter a valid email address.');
    }
    const gst = form.gst_number.trim().toUpperCase();
    if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)) {
      return setProblem('A GST number has 15 characters, like 37ABCDE1234F1Z5.');
    }
    setProblem('');
    save.mutate({ shop: { ...form, gst_number: gst } });
  };
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Section
      id="shop"
      title="Shop details"
      description="Shown on the public site (footer and contact)."
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <div className="grid gap-md md:grid-cols-2">
        <Input
          label="Address"
          value={form.address}
          onChange={set('address')}
          error={nested(fields, 'address')}
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={set('phone')}
          error={nested(fields, 'phone')}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={nested(fields, 'email')}
        />
        <Input
          label="Map link"
          value={form.map_url}
          onChange={set('map_url')}
          error={nested(fields, 'map_url')}
        />
        <Input
          label="GST number"
          hint="15 characters. Leave empty if not registered."
          value={form.gst_number}
          onChange={set('gst_number')}
          error={nested(fields, 'gst_number')}
        />
      </div>
    </Section>
  );
}

// ----------------------------------------------------------------------------------- hours

interface DayRow {
  open: boolean;
  start: string;
  end: string;
}

function HoursSection({ value }: { value: BusinessSettings['hours']['weekly_hours'] }) {
  const [rows, setRows] = useState<Record<Weekday, DayRow>>(() => {
    const out = {} as Record<Weekday, DayRow>;
    for (const day of WEEKDAYS) {
      const hours = value[day];
      out[day] = hours
        ? { open: true, start: hours[0], end: hours[1] }
        : { open: false, start: '10:00', end: '20:00' };
    }
    return out;
  });
  const { save, problem, setProblem } = useSection();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const weekly: Record<string, [string, string] | null> = {};
    for (const day of WEEKDAYS) {
      const row = rows[day];
      if (!row.open) {
        weekly[day] = null;
      } else if (!row.start || !row.end || row.start >= row.end) {
        return setProblem(`${dayNames[day]}: closing time must be after opening time.`);
      } else {
        weekly[day] = [row.start, row.end];
      }
    }
    setProblem('');
    save.mutate({ hours: { weekly_hours: weekly } });
  };
  const set = (day: Weekday, patch: Partial<DayRow>) =>
    setRows((r) => ({ ...r, [day]: { ...r[day], ...patch } }));
  return (
    <Section
      id="hours"
      title="Opening hours"
      description="Guests can only book inside these hours. The public site's hours list follows them."
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <div className="flex flex-col gap-sm">
        {WEEKDAYS.map((day) => (
          <div key={day} className="flex flex-wrap items-end gap-md">
            <span className="w-28 pb-3 text-sm text-text">{dayNames[day]}</span>
            <Checkbox
              label={`${dayNames[day]} open`}
              checked={rows[day].open}
              onChange={(e) => set(day, { open: e.target.checked })}
            />
            {rows[day].open && (
              <>
                <Input
                  label={`${dayNames[day]} opens`}
                  type="time"
                  value={rows[day].start}
                  onChange={(e) => set(day, { start: e.target.value })}
                />
                <Input
                  label={`${dayNames[day]} closes`}
                  type="time"
                  value={rows[day].end}
                  onChange={(e) => set(day, { end: e.target.value })}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// --------------------------------------------------------------------------------- booking

function wholeNumber(text: string, min: number, max: number): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function BookingSection({ value }: { value: BusinessSettings['booking'] }) {
  const [cancel, setCancel] = useState(String(value.free_cancel_hours));
  const [hold, setHold] = useState(String(value.hold_hours));
  const [offer, setOffer] = useState(String(value.waitlist_offer_minutes));
  const { save, problem, setProblem } = useSection();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const c = wholeNumber(cancel, 0, 720);
    const h = wholeNumber(hold, 1, 72);
    if (c === null)
      return setProblem('Free-cancellation window: a whole number of hours, 0 to 720.');
    if (h === null) return setProblem('Payment hold time: a whole number of hours, 1 to 72.');
    const o = wholeNumber(offer, 5, 240);
    if (o === null) return setProblem('Waitlist offer hold: a whole number of minutes, 5 to 240.');
    setProblem('');
    save.mutate({
      booking: { free_cancel_hours: c, hold_hours: h, waitlist_offer_minutes: o },
    });
  };
  return (
    <Section
      id="booking"
      title="Booking rules"
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <div className="grid gap-md md:grid-cols-2">
        <Input
          label="Free cancellation until (hours before the visit)"
          inputMode="numeric"
          value={cancel}
          onChange={(e) => setCancel(e.target.value)}
        />
        <Input
          label="Payment link stays open for (hours)"
          hint="After this the slot is released."
          inputMode="numeric"
          value={hold}
          onChange={(e) => setHold(e.target.value)}
        />
        <Input
          label="Waitlist offer is held for (minutes)"
          hint="A freed slot is held for the first person in line this long, then moves to the next."
          inputMode="numeric"
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
        />
      </div>
    </Section>
  );
}

// --------------------------------------------------------------------------------- billing

function BillingSection({ value }: { value: BusinessSettings['billing'] }) {
  const [cap, setCap] = useState(String(value.discount_cap_percent));
  const { save, problem, setProblem } = useSection();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = wholeNumber(cap, 0, 100);
    if (n === null) return setProblem('Enter a whole number from 0 to 100.');
    setProblem('');
    save.mutate({ billing: { discount_cap_percent: n } });
  };
  return (
    <Section
      id="billing"
      title="Billing"
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <Input
        label="Discount cap (%)"
        hint="The most a receptionist can take off a bill at checkout. You can go further."
        inputMode="numeric"
        value={cap}
        onChange={(e) => setCap(e.target.value)}
        className="max-w-xs"
      />
    </Section>
  );
}

// -------------------------------------------------------------------------------- security

function SecuritySection({ value }: { value: BusinessSettings['security'] }) {
  const [idle, setIdle] = useState(String(value.idle_minutes));
  const { save, problem, setProblem } = useSection();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = wholeNumber(idle, 5, 120);
    if (n === null) return setProblem('Enter a whole number of minutes, 5 to 120.');
    setProblem('');
    save.mutate({ security: { idle_minutes: n } });
  };
  return (
    <Section
      id="security"
      title="Security"
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <Input
        label="Receptionist idle timeout (minutes)"
        hint="A receptionist with no activity this long is signed out, and their working hours stop counting."
        inputMode="numeric"
        value={idle}
        onChange={(e) => setIdle(e.target.value)}
        className="max-w-xs"
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------------- rating

interface BandRow {
  min_average: string;
  multiplier: string;
}

function RatingSection({ value }: { value: BusinessSettings['rating'] }) {
  const [minRatings, setMinRatings] = useState(String(value.min_ratings));
  const [flag, setFlag] = useState(value.flag_below);
  const [bands, setBands] = useState<BandRow[]>(value.bands);
  const { save, problem, setProblem } = useSection();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const min = wholeNumber(minRatings, 1, 100);
    if (min === null) return setProblem('Ratings needed: a whole number from 1 to 100.');
    const flagNumber = Number(flag);
    if (flag.trim() === '' || Number.isNaN(flagNumber) || flagNumber < 0 || flagNumber > 5) {
      return setProblem('Flag below: a number from 0 to 5.');
    }
    if (bands.length === 0) return setProblem('Add at least one band.');
    let previous = Infinity;
    for (const band of bands) {
      const average = Number(band.min_average);
      const multiplier = Number(band.multiplier);
      if (band.min_average.trim() === '' || Number.isNaN(average) || average < 0 || average > 5) {
        return setProblem('Each band needs an average from 0 to 5.');
      }
      if (
        band.multiplier.trim() === '' ||
        Number.isNaN(multiplier) ||
        multiplier < 0.5 ||
        multiplier > 2
      ) {
        return setProblem('Each multiplier must be from 0.50 to 2.00.');
      }
      if (average >= previous) {
        return setProblem('List the bands from the highest average down, each average once.');
      }
      previous = average;
    }
    if (Number(bands[bands.length - 1].min_average) !== 0) {
      return setProblem('The last band must start at 0 so every stylist is covered.');
    }
    setProblem('');
    save.mutate({ rating: { min_ratings: min, flag_below: flag.trim(), bands } });
  };

  const edit = (index: number, patch: Partial<BandRow>) =>
    setBands((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Section
      id="rating"
      title="Rating bands"
      description="A stylist's task pay is multiplied by the band their average rating falls in. Tips are never multiplied."
      onSubmit={submit}
      pending={save.isPending}
      problem={problem}
    >
      <div className="grid gap-md md:grid-cols-2">
        <Input
          label="Ratings needed before bands apply"
          inputMode="numeric"
          value={minRatings}
          onChange={(e) => setMinRatings(e.target.value)}
        />
        <Input
          label="Flag a stylist below this average"
          inputMode="decimal"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
        <legend className="px-1 text-sm font-medium text-text">Bands (highest first)</legend>
        {bands.map((band, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-sm">
            <Input
              label={`Band ${index + 1}: average from`}
              inputMode="decimal"
              value={band.min_average}
              onChange={(e) => edit(index, { min_average: e.target.value })}
            />
            <Input
              label={`Band ${index + 1}: multiplier`}
              inputMode="decimal"
              value={band.multiplier}
              onChange={(e) => edit(index, { multiplier: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove band ${index + 1}`}
              onClick={() => setBands((rows) => rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setBands((rows) => [...rows, { min_average: '', multiplier: '1.00' }])}
          >
            Add band
          </Button>
        </div>
      </fieldset>
    </Section>
  );
}
