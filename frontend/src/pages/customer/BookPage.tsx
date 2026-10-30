import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Minus, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  conflictSlots,
  getBookingOptions,
  getSlots,
  packageCodeFieldError,
  type BookingRequestPayload,
  sendBookingRequest,
  type BookingOptions,
} from '../../api/booking';
import { PENDING_RATINGS_KEY, isEmailUnverified, isRatingsPending } from '../../api/billing';
import { classifyError, serverFieldErrors } from '../../api/client';
import { getServices } from '../../api/public';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { RatingPrompt } from '../../components/booking/RatingPrompt';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  FilterChips,
  IconButton,
  Input,
  LoadingState,
  Select,
  Textarea,
  useToast,
  type ChipOption,
} from '../../components/ui';
import { divisions, type DivisionId } from '../../config/divisions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  formatDateTime,
  formatDay,
  formatDuration,
  formatINR,
  SHOP_TIME_ZONE,
} from '../../lib/format';
import { fieldErrors, isIndianMobile } from '../../lib/validation';
import { ButtonLink } from '../../components/ui/ButtonLink';

/** /customer/book: pick a service first, then the booking sheet for it. */
export default function BookPage() {
  useDocumentTitle('Book an appointment');
  const [params] = useSearchParams();
  const service = params.get('service');
  return service ? <BookingSheet slug={service} /> : <ServicePicker />;
}

// ----------------------------------------------------------------------------- service picker

const divisionChips: ChipOption<DivisionId>[] = divisions.map((d) => ({
  value: d.id,
  label: d.label,
}));

function ServicePicker() {
  const [division, setDivision] = useState<DivisionId>(divisions[0].id);
  const [search, setSearch] = useState('');
  const services = useQuery({
    queryKey: ['services', division, 'all', 'all', ''],
    queryFn: () => getServices({ division }),
  });
  const term = search.trim().toLowerCase();
  const shown = (services.data ?? []).filter(
    (s) => !term || `${s.name} ${s.category.name}`.toLowerCase().includes(term),
  );

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader
        title="Book an appointment"
        description="Choose a service. Next you pick a preferred time and stylist, and send a request."
      />
      <div className="flex flex-col gap-md sm:flex-row sm:items-end sm:justify-between">
        <FilterChips
          label="Division"
          options={divisionChips}
          value={division}
          onChange={setDivision}
        />
        <div className="sm:w-72">
          <Input
            label="Search services"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {services.isPending ? (
        <LoadingState label="Loading services…" />
      ) : services.isError ? (
        <ErrorState
          description="We couldn't load the services."
          onRetry={() => void services.refetch()}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No services found"
          description="Try another division or search term."
        />
      ) : (
        <ul className="card-grid">
          {shown.map((s) => (
            <li key={s.id}>
              <Card variant="plain" padding="md" className="flex h-full flex-col gap-sm">
                <p className="text-xs font-medium text-text-muted">{s.category.name}</p>
                <h2 className="text-base font-semibold text-text">{s.name}</h2>
                <p className="flex-1 text-sm text-text-muted">{s.summary}</p>
                <div className="flex items-center justify-between gap-sm">
                  <span className="text-sm font-semibold text-text">
                    from {formatINR(s.from_price)}
                  </span>
                  <ButtonLink
                    to={`/customer/book?service=${encodeURIComponent(s.slug)}`}
                    variant="secondary"
                    size="sm"
                    aria-label={`Book ${s.name}`}
                  >
                    Book
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------- booking sheet

function BookingSheet({ slug }: { slug: string }) {
  const options = useQuery({
    queryKey: ['booking-options', slug],
    queryFn: () => getBookingOptions(slug),
  });

  if (options.isPending)
    return <LoadingState label="Loading the booking sheet…" className="py-xl" />;
  if (options.isError) {
    const missing = classifyError(options.error) === 'not_found';
    return (
      <div className="py-xl">
        {missing ? (
          <EmptyState
            icon={<CalendarX className="h-6 w-6" />}
            title="This service is not available"
            description="It may have been removed. Please choose another service."
            action={<Link to="/customer/book">Choose a service</Link>}
          />
        ) : (
          <ErrorState
            description="We couldn't load the booking sheet."
            onRetry={() => void options.refetch()}
          />
        )}
      </div>
    );
  }
  if (options.data.pending_ratings > 0) {
    return (
      <div className="flex flex-col gap-lg py-lg">
        <RatingPrompt />
      </div>
    );
  }
  return <BookingForm options={options.data} />;
}

type FieldName =
  | 'variant'
  | 'slot'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'notes'
  | 'allergies'
  | 'package_code'
  | 'consent';

const schema = z.object({
  variant: z.string(),
  slot: z.string().min(1, 'Choose a time.'),
  contact_name: z.string().trim().min(2, 'Enter your name.').max(120, 'Name is too long.'),
  contact_email: z.string().trim().email('Enter a valid email address.'),
  contact_phone: z.string().refine(isIndianMobile, 'Enter a valid 10-digit mobile number.'),
  notes: z.string().max(500, 'Keep notes under 500 characters.'),
  allergies: z.string().max(500, 'Keep this under 500 characters.'),
  package_code: z.string().trim().max(32, 'That code is too long.'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the cancellation policy.' }),
  }),
});

/** A problem with the products the customer picked (out of stock, no longer sold). */
function productsFieldError(error: unknown): string | null {
  const data = (error as { response?: { data?: { field?: string; detail?: string } } })?.response
    ?.data;
  return data?.field === 'products' ? (data.detail ?? 'Check the products you picked.') : null;
}

function BookingForm({ options }: { options: BookingOptions }) {
  const { service, stylists, days, rules, contact } = options;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [variant, setVariant] = useState(service.variants[0]?.id ?? '');
  const [addons, setAddons] = useState<string[]>([]);
  const [day, setDay] = useState(days[0] ?? '');
  const [stylist, setStylist] = useState('');
  const [slot, setSlot] = useState('');
  const [suggested, setSuggested] = useState<string[]>([]);
  const [form, setForm] = useState({
    contact_name: contact.name,
    contact_email: contact.email,
    contact_phone: contact.phone,
    notes: '',
    allergies: contact.allergies,
    package_code: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [picked, setPicked] = useState<Record<string, number>>({});
  const recommended = options.recommended_products ?? [];
  const productTotal = recommended.reduce(
    (sum, p) => sum + Number(p.price) * (picked[p.id] ?? 0),
    0,
  );
  const [productProblem, setProductProblem] = useState('');

  const slotKey = [service.slug, variant, addons.join(','), day, stylist];
  const slots = useQuery({
    queryKey: ['booking-slots', ...slotKey],
    queryFn: () =>
      getSlots({
        service: service.slug,
        variant: variant || undefined,
        addons,
        date: day,
        stylist,
      }),
    enabled: !!day,
  });

  // A different choice can change the free times: drop a time that is no longer offered.
  useEffect(() => {
    if (slot && slots.data && !slots.data.slots.includes(slot) && !suggested.includes(slot)) {
      setSlot('');
    }
  }, [slots.data, slot, suggested]);

  const dayOptions = useMemo(() => days.map((d) => ({ value: d, label: formatDay(d) })), [days]);
  const stylistOptions = [
    { value: '', label: 'Any available stylist' },
    ...stylists.map((s) => ({ value: s.id, label: `${s.display_name} · ${s.title}` })),
  ];

  const send = useMutation({
    mutationFn: (payload: BookingRequestPayload) => sendBookingRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      toast.show({
        tone: 'success',
        title: 'Booking request sent',
        description: 'We will confirm it and email you a payment link.',
      });
      navigate('/customer/appointments');
    },
    onError: (error) => {
      const packageCodeIssue = packageCodeFieldError(error);
      if (packageCodeIssue) {
        setErrors((current) => ({ ...current, package_code: packageCodeIssue }));
        return;
      }
      const productIssue = productsFieldError(error);
      if (productIssue) {
        setProductProblem(productIssue);
        return;
      }
      const nearest = conflictSlots(error);
      if (nearest.length || classifyError(error) === 'conflict') {
        setSlot('');
        setSuggested(nearest);
        void queryClient.invalidateQueries({ queryKey: ['booking-slots'] });
        toast.show({
          tone: 'warning',
          title: 'That time was just taken',
          description: nearest.length
            ? 'Pick one of the nearest free times below.'
            : 'Please pick another time.',
        });
        return;
      }
      if (isEmailUnverified(error)) {
        toast.show({
          tone: 'warning',
          title: 'Verify your email first',
          description: 'Sign out and sign in again, then enter the code we email you.',
        });
        return;
      }
      if (isRatingsPending(error)) {
        void queryClient.invalidateQueries({ queryKey: ['booking-options'] });
        void queryClient.invalidateQueries({ queryKey: PENDING_RATINGS_KEY });
        toast.show({
          tone: 'warning',
          title: 'Rate your recent visit first',
          description: 'New booking requests open again once you have rated it.',
        });
        return;
      }
      const fromServer = serverFieldErrors(error) as Partial<Record<FieldName, string>>;
      setErrors(fromServer);
      if (Object.keys(fromServer).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Request not sent',
          description: genericErrorMessage(error, 'Please try again.'),
        });
      }
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse({ ...form, variant, slot });
    if (!parsed.success) {
      setErrors(fieldErrors<FieldName>(parsed.error));
      return;
    }
    setErrors({});
    setProductProblem('');
    send.mutate({
      service: service.slug,
      variant: variant || null,
      addons,
      start: slot,
      stylist: stylist || null,
      contact_name: parsed.data.contact_name,
      contact_email: parsed.data.contact_email,
      contact_phone: parsed.data.contact_phone,
      notes: parsed.data.notes,
      allergies: parsed.data.allergies,
      package_code: parsed.data.package_code || undefined,
      ...(Object.keys(picked).length
        ? {
            products: Object.entries(picked).map(([product, quantity]) => ({
              product,
              quantity,
            })),
          }
        : {}),
      consent: true,
    });
  };

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const toggleAddon = (id: string) =>
    setAddons((current) =>
      current.includes(id) ? current.filter((a) => a !== id) : [...current, id],
    );

  const pickSuggested = (iso: string) => {
    setSlot(iso);
    const shopDay = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(
      new Date(iso),
    );
    if (days.includes(shopDay)) setDay(shopDay);
  };

  const price = slots.data;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-lg py-lg">
      <PageHeader
        eyebrow="Booking request"
        title={service.name}
        description={service.summary}
        actions={
          <Link
            to="/customer/book"
            className="text-sm font-medium text-primary-hover hover:underline"
          >
            Change service
          </Link>
        }
      />

      <div className="grid gap-lg lg:grid-cols-3">
        <div className="flex flex-col gap-lg lg:col-span-2">
          <Card variant="plain" padding="lg" as="section" className="flex flex-col gap-md">
            <h2 className="text-base font-semibold text-text">1. Your service</h2>
            {service.variants.length > 0 && (
              <Select
                label="Option"
                required
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
                options={service.variants.map((v) => ({
                  value: v.id,
                  label: `${v.label} · ${formatDuration(v.duration_minutes)} · ${formatINR(v.price)}`,
                }))}
                error={errors.variant}
              />
            )}
            {service.addons.length > 0 && (
              <fieldset className="flex flex-col gap-sm">
                <legend className="mb-sm text-sm font-medium text-text">Add-ons (optional)</legend>
                {service.addons.map((addon) => (
                  <Checkbox
                    key={addon.id}
                    checked={addons.includes(addon.id)}
                    onChange={() => toggleAddon(addon.id)}
                    label={`${addon.label} (+ ${formatINR(addon.price)})`}
                  />
                ))}
              </fieldset>
            )}
          </Card>

          <Card variant="plain" padding="lg" as="section" className="flex flex-col gap-md">
            <h2 className="text-base font-semibold text-text">2. Preferred time and stylist</h2>
            <div className="grid gap-md sm:grid-cols-2">
              <Select
                label="Date"
                required
                value={day}
                onChange={(event) => {
                  setDay(event.target.value);
                  setSuggested([]);
                }}
                options={dayOptions}
              />
              <Select
                label="Stylist"
                value={stylist}
                onChange={(event) => {
                  setStylist(event.target.value);
                  setSuggested([]);
                }}
                options={stylistOptions}
              />
            </div>
            {suggested.length > 0 && (
              <div className="rounded-nested bg-warning-soft p-md">
                <SlotPicker
                  label="Nearest free times"
                  slots={suggested}
                  value={slot}
                  onChange={pickSuggested}
                  format={formatDateTime}
                />
              </div>
            )}
            {days.length === 0 ? (
              <p className="text-sm text-text-muted">
                No open days are available to book right now.
              </p>
            ) : slots.isPending ? (
              <LoadingState label="Finding free times…" lines={2} />
            ) : slots.isError ? (
              <ErrorState
                description={genericErrorMessage(slots.error, "We couldn't load the free times.")}
                onRetry={() => void slots.refetch()}
              />
            ) : slots.data.slots.length === 0 ? (
              <p className="rounded-nested bg-surface-muted p-md text-sm text-text-muted">
                No free times on this day{stylist ? ' with this stylist' : ''}. Try another day
                {stylist ? ' or "Any available stylist"' : ''}.
              </p>
            ) : (
              <SlotPicker
                label="Start time"
                slots={slots.data.slots}
                value={slot}
                onChange={(value) => {
                  setSlot(value);
                  setSuggested([]);
                }}
                error={errors.slot}
              />
            )}
            {errors.slot && slots.data?.slots.length === 0 && (
              <p className="text-xs font-medium text-danger-text">{errors.slot}</p>
            )}
          </Card>

          <Card variant="plain" padding="lg" as="section" className="flex flex-col gap-md">
            <h2 className="text-base font-semibold text-text">3. Your details</h2>
            <div className="grid gap-md sm:grid-cols-2">
              <Input
                label="Name"
                required
                autoComplete="name"
                value={form.contact_name}
                onChange={update('contact_name')}
                error={errors.contact_name}
              />
              <Input
                label="Mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={form.contact_phone}
                onChange={update('contact_phone')}
                error={errors.contact_phone}
              />
            </div>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              hint="Your payment link is sent here."
              value={form.contact_email}
              onChange={update('contact_email')}
              error={errors.contact_email}
            />
            <Textarea
              label="Allergies or sensitivities"
              hint="Only the salon team sees this. It is stored encrypted."
              value={form.allergies}
              onChange={update('allergies')}
              error={errors.allergies}
            />
            <Textarea
              label="Notes for the salon"
              value={form.notes}
              onChange={update('notes')}
              error={errors.notes}
            />
          </Card>

          <Card variant="plain" padding="lg" as="section" className="flex flex-col gap-md">
            <h2 className="text-base font-semibold text-text">4. Package code (optional)</h2>
            <p className="text-sm text-text-muted">
              Have a package with sessions on it for this service? Enter its code to use one session
              here instead of paying — no money is due if it's accepted.
            </p>
            <Input
              label="Package code"
              placeholder="e.g. 4F7K-9QRS-T2WX"
              autoComplete="off"
              value={form.package_code}
              onChange={update('package_code')}
              error={errors.package_code}
            />
          </Card>

          {recommended.length > 0 && (
            <Card variant="plain" padding="lg" as="section" className="flex flex-col gap-md">
              <h2 className="text-base font-semibold text-text">5. Add products (optional)</h2>
              <p className="text-sm text-text-muted">
                Picked by the salon for this service. They are kept for you and paid online with the
                booking.
              </p>
              <ul className="flex flex-col gap-sm">
                {recommended.map((p) => {
                  const qty = picked[p.id] ?? 0;
                  const set = (n: number) =>
                    setPicked((cur) => {
                      const next = { ...cur };
                      if (n <= 0) delete next[p.id];
                      else next[p.id] = n;
                      return next;
                    });
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-sm"
                      aria-label={p.name}
                    >
                      <div>
                        <p className="font-medium text-text">{p.name}</p>
                        <p className="text-xs text-text-muted">
                          {formatINR(p.price)} incl. GST
                          {!p.in_stock && ' · out of stock'}
                        </p>
                      </div>
                      <div className="flex items-center gap-xs">
                        <IconButton
                          label={`One less ${p.name}`}
                          icon={<Minus className="size-4" />}
                          disabled={qty === 0}
                          onClick={() => set(qty - 1)}
                        />
                        <span className="min-w-6 text-center font-semibold text-text">{qty}</span>
                        <IconButton
                          label={`One more ${p.name}`}
                          icon={<Plus className="size-4" />}
                          disabled={!p.in_stock || qty >= p.available}
                          onClick={() => set(qty + 1)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {productProblem && (
                <p role="alert" className="text-sm font-medium text-danger-text">
                  {productProblem}
                </p>
              )}
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-md">
          <Card variant="glass" padding="lg" className="flex flex-col gap-md lg:sticky lg:top-24">
            <h2 className="text-base font-semibold text-text">Summary</h2>
            <dl className="flex flex-col gap-sm text-sm">
              <div className="flex justify-between gap-md">
                <dt className="text-text-muted">When</dt>
                <dd className="text-right font-medium text-text">
                  {slot ? formatDateTime(slot) : 'Choose a time'}
                </dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="text-text-muted">Duration</dt>
                <dd className="font-medium text-text">
                  {price ? formatDuration(price.duration_minutes) : '…'}
                </dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="text-text-muted">Total (incl. GST)</dt>
                <dd className="font-semibold text-text">
                  {price ? formatINR(price.price_total) : '…'}
                </dd>
              </div>
              {price && (
                <div className="flex justify-between gap-md text-xs text-text-muted">
                  <dt>of which GST ({rules.gst_percent}%)</dt>
                  <dd>{formatINR(price.gst_amount)}</dd>
                </div>
              )}
              {productTotal > 0 && (
                <div className="flex justify-between gap-md">
                  <dt className="text-text-muted">Products</dt>
                  <dd className="font-medium text-text">{formatINR(productTotal)}</dd>
                </div>
              )}
              {price && (
                <div className="flex justify-between gap-md border-t border-border pt-sm">
                  <dt className="text-text-muted">Pay online after we confirm</dt>
                  <dd className="font-semibold text-text">
                    {formatINR(Number(price.amount_payable) + productTotal)}
                  </dd>
                </div>
              )}
            </dl>
            {form.package_code.trim() && (
              <p className="rounded-nested bg-surface-muted p-sm text-xs text-text-muted">
                If “{form.package_code.trim()}” is a valid package code for this service, one
                session will be used and nothing will be due above.
              </p>
            )}
            <p className="text-xs text-text-muted">
              This is a request. We confirm the time and stylist, then email a payment link that is
              valid for up to {rules.hold_hours} hours. Free cancellation until{' '}
              {rules.free_cancel_hours} hours before the visit.
            </p>
            <Checkbox
              checked={form.consent}
              onChange={(event) =>
                setForm((current) => ({ ...current, consent: event.target.checked }))
              }
              error={errors.consent}
              label={
                <>
                  I accept the{' '}
                  <Link
                    to="/cancellation-policy"
                    target="_blank"
                    className="font-medium text-primary-hover underline"
                  >
                    cancellation policy
                  </Link>
                  .
                </>
              }
            />
            <Button
              type="submit"
              loading={send.isPending}
              loadingText="Sending your request…"
              fullWidth
            >
              Send booking request
            </Button>
          </Card>
        </aside>
      </div>
    </form>
  );
}
