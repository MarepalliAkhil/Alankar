import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createCoupon,
  listCoupons,
  updateCoupon,
  type CouponInput,
  type CouponRow,
  type CouponState,
} from '../../../api/marketing';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import { describe } from './couponText';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  useToast,
  type BadgeTone,
} from '../../ui';

const STATE: Record<CouponState, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  off: { label: 'Switched off', tone: 'neutral' },
  scheduled: { label: 'Starts later', tone: 'info' },
  expired: { label: 'Expired', tone: 'neutral' },
  used_up: { label: 'Fully used', tone: 'warning' },
};

/** Coupons are typed in at the till. One per bill; most cannot be mixed with a manual discount. */
export function CouponsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const coupons = useQuery({ queryKey: ['mk-coupons'], queryFn: listCoupons });
  const [editing, setEditing] = useState<CouponRow | 'new' | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['mk-coupons'] });
  const flip = useMutation({
    mutationFn: (c: CouponRow) => updateCoupon(c.id, { is_active: !c.is_active }),
    onSuccess: (c) => {
      refresh();
      toast.show({
        tone: 'success',
        title: c.is_active ? `${c.code} switched on` : `${c.code} switched off`,
      });
    },
  });
  return (
    <Card variant="dense" as="section" aria-label="Coupons">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Coupons</h2>
          <p className="mt-1 text-sm text-text-muted">
            Typed in at the counter. One coupon per bill. A coupon that is not marked “can be
            combined” cannot be used on a bill that also has a manual discount.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> New coupon
        </Button>
      </div>
      <div className="mt-md">
        {coupons.isPending ? (
          <LoadingState label="Loading coupons…" />
        ) : coupons.isError ? (
          <ErrorState
            description="We couldn't load the coupons."
            onRetry={() => void coupons.refetch()}
          />
        ) : coupons.data.length === 0 ? (
          <EmptyState
            title="No coupons yet"
            description="Create one to give a customer a discount."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {coupons.data.map((c) => (
              <li key={c.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-mono font-semibold text-text">{c.code}</p>
                  <span className="text-sm text-text-muted">{c.name}</span>
                  <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
                  {c.stackable && <Badge tone="info">Can be combined</Badge>}
                </div>
                <p className="mt-xs text-sm text-text-muted">{describe(c)}</p>
                <p className="mt-xs text-xs text-text-muted">
                  Used {c.used}
                  {c.total_limit ? ` of ${c.total_limit}` : ''} · {c.per_customer_limit} per
                  customer
                  {c.starts_on ? ` · from ${c.starts_on}` : ''}
                  {c.ends_on ? ` · until ${c.ends_on}` : ''}
                </p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => flip.mutate(c)}
                    disabled={flip.isPending}
                  >
                    {c.is_active ? 'Switch off' : 'Switch on'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <CouponForm
          coupon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function CouponForm({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: CouponRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: coupon?.code ?? '',
    name: coupon?.name ?? '',
    kind: coupon?.kind ?? 'percent',
    value: coupon?.value ? String(Number(coupon.value)) : '',
    min_bill: coupon ? String(Number(coupon.min_bill)) : '0',
    max_discount: coupon?.max_discount ? String(Number(coupon.max_discount)) : '',
    starts_on: coupon?.starts_on ?? '',
    ends_on: coupon?.ends_on ?? '',
    total_limit: coupon?.total_limit ? String(coupon.total_limit) : '',
    per_customer_limit: String(coupon?.per_customer_limit ?? 1),
    applies_to: coupon?.applies_to ?? 'all',
    stackable: coupon?.stackable ?? false,
    is_active: coupon?.is_active ?? true,
  });
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: CouponInput) =>
      coupon ? updateCoupon(coupon.id, body) : createCoupon(body),
    onSuccess: () => {
      toast.show({ tone: 'success', title: coupon ? 'Coupon saved' : 'Coupon created' });
      onSaved();
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save.'),
      );
    },
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(form.code.trim())) {
      return setProblem('The code needs 3 to 24 letters, numbers, - or _.');
    }
    if (!form.name.trim()) return setProblem('Give the coupon a name.');
    if (!(Number(form.value) > 0)) return setProblem('Enter how much it takes off.');
    if (form.kind === 'percent' && Number(form.value) > 100)
      return setProblem('A percentage cannot be more than 100.');
    setProblem('');
    save.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      kind: form.kind,
      value: form.value,
      min_bill: form.min_bill || '0',
      max_discount: form.max_discount || null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      total_limit: form.total_limit ? Number(form.total_limit) : null,
      per_customer_limit: Number(form.per_customer_limit || 1),
      applies_to: form.applies_to,
      stackable: form.stackable,
      is_active: form.is_active,
    });
  };
  return (
    <Modal open onClose={onClose} title={coupon ? `Edit ${coupon.code}` : 'New coupon'} size="lg">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Input
            label="Code"
            hint="What the receptionist types in."
            value={form.code}
            error={fields.code}
            onChange={set('code')}
          />
          <Input label="Name" value={form.name} error={fields.name} onChange={set('name')} />
          <Select
            label="Type"
            value={form.kind}
            onChange={set('kind')}
            options={[
              { value: 'percent', label: 'Percent off' },
              { value: 'flat', label: 'Rupees off' },
            ]}
          />
          <Input
            label={form.kind === 'percent' ? 'Percent off' : 'Rupees off'}
            inputMode="decimal"
            value={form.value}
            error={fields.value}
            onChange={set('value')}
          />
          <Input
            label="Smallest bill (₹)"
            hint="0 for any bill."
            inputMode="decimal"
            value={form.min_bill}
            error={fields.min_bill}
            onChange={set('min_bill')}
          />
          <Input
            label="Most it can take off (₹)"
            hint="Optional cap."
            inputMode="decimal"
            value={form.max_discount}
            error={fields.max_discount}
            onChange={set('max_discount')}
          />
          <Input
            label="Starts on"
            type="date"
            value={form.starts_on}
            error={fields.starts_on}
            onChange={set('starts_on')}
          />
          <Input
            label="Ends on"
            type="date"
            value={form.ends_on}
            error={fields.ends_on}
            onChange={set('ends_on')}
          />
          <Input
            label="Total uses allowed"
            hint="Empty for no limit."
            inputMode="numeric"
            value={form.total_limit}
            error={fields.total_limit}
            onChange={set('total_limit')}
          />
          <Input
            label="Uses per customer"
            inputMode="numeric"
            value={form.per_customer_limit}
            error={fields.per_customer_limit}
            onChange={set('per_customer_limit')}
          />
          <Select
            label="Applies to"
            value={form.applies_to}
            onChange={set('applies_to')}
            options={[
              { value: 'all', label: 'Whole bill' },
              { value: 'services', label: 'Services only' },
              { value: 'products', label: 'Products only' },
            ]}
          />
        </div>
        <Checkbox
          label="Can be combined with a manual discount (still capped for receptionists)"
          checked={form.stackable}
          onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))}
        />
        <Checkbox
          label="Switched on"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Save coupon
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
