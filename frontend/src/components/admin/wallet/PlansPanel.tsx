import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { listAdminServices } from '../../../api/admin';
import { errorDetail } from '../../../api/client';
import {
  createPlan,
  listPlans,
  updatePlan,
  type PlanInput,
  type PlanRow,
} from '../../../api/wallet';
import { formatINR } from '../../../lib/format';
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
  Textarea,
  useToast,
} from '../../ui';

const PERIODS = [
  { value: '1', label: 'Monthly' },
  { value: '3', label: 'Every 3 months' },
  { value: '12', label: 'Yearly' },
];

/** Admin: membership plans (a percentage off, optionally some sessions included each period). */
export function PlansPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ['w-plans'], queryFn: listPlans });
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['w-plans'] });
  const flip = useMutation({
    mutationFn: (p: PlanRow) => updatePlan(p.id, { is_active: !p.is_active }),
    onSuccess: (p) => {
      refresh();
      toast.show({
        tone: 'success',
        title: p.is_active ? `${p.name} is open` : `${p.name} is closed`,
      });
    },
  });
  return (
    <Card variant="dense" as="section" aria-label="Membership plans">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Membership plans</h2>
          <p className="mt-1 text-sm text-text-muted">
            Members get a percentage off every bill and may get free sessions each period. Terms are
            copied when someone joins, so editing a plan never changes current members.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> New plan
        </Button>
      </div>
      <div className="mt-md">
        {plans.isPending ? (
          <LoadingState label="Loading plans…" />
        ) : plans.isError ? (
          <ErrorState
            description="We couldn't load the plans."
            onRetry={() => void plans.refetch()}
          />
        ) : plans.data.length === 0 ? (
          <EmptyState title="No plans yet" description="Create one so customers can join." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {plans.data.map((p) => (
              <li key={p.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{p.name}</p>
                  <Badge tone={p.is_active ? 'success' : 'neutral'}>
                    {p.is_active ? 'Open' : 'Closed'}
                  </Badge>
                  <span className="text-sm text-text-muted">
                    {formatINR(p.price)} per{' '}
                    {p.period_months === 12
                      ? 'year'
                      : `${p.period_months} month${p.period_months > 1 ? 's' : ''}`}
                    {' · '}
                    {Number(p.discount_percent)}% off
                    {p.included_sessions > 0 ? ` · ${p.included_sessions} free session(s)` : ''}
                    {' · '}
                    {p.members ?? 0} member(s)
                  </span>
                </div>
                {p.rules && <p className="mt-xs text-sm text-text-muted">{p.rules}</p>}
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button
                    loading={flip.isPending && flip.variables?.id === p.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={flip.isPending}
                    onClick={() => flip.mutate(p)}
                  >
                    {p.is_active ? 'Close plan' : 'Open plan'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <PlanForm
          plan={editing === 'new' ? null : editing}
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

function PlanForm({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const services = useQuery({ queryKey: ['w-services'], queryFn: listAdminServices });
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan ? String(Number(plan.price)) : '',
    period_months: String(plan?.period_months ?? 1),
    discount_percent: plan ? String(Number(plan.discount_percent)) : '10',
    included_sessions: String(plan?.included_sessions ?? 0),
    rules: plan?.rules ?? '',
    applies_to_products: plan?.applies_to_products ?? false,
    is_active: plan?.is_active ?? true,
  });
  const [included, setIncluded] = useState<string[]>(
    plan?.included_services.map((s) => s.id) ?? [],
  );
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: (body: PlanInput) => (plan ? updatePlan(plan.id, body) : createPlan(body)),
    onSuccess: () => {
      toast.show({ tone: 'success', title: plan ? 'Plan saved' : 'Plan created' });
      onSaved();
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save.'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setProblem('Give the plan a name.');
    if (!(Number(form.price) > 0)) return setProblem('Enter the price.');
    const pct = Number(form.discount_percent);
    if (!(pct >= 0 && pct <= 100)) return setProblem('The discount must be between 0 and 100.');
    setProblem('');
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price,
      period_months: Number(form.period_months),
      discount_percent: form.discount_percent,
      included_sessions: Number(form.included_sessions || 0),
      included_services: included,
      rules: form.rules.trim(),
      applies_to_products: form.applies_to_products,
      is_active: form.is_active,
    });
  };
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      size="lg"
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={set('name')} />
          <Input label="Price (₹)" inputMode="decimal" value={form.price} onChange={set('price')} />
          <Select
            label="Billing period"
            value={form.period_months}
            options={PERIODS}
            onChange={set('period_months')}
          />
          <Input
            label="Discount on every bill (%)"
            inputMode="decimal"
            value={form.discount_percent}
            onChange={set('discount_percent')}
          />
          <Input
            label="Free sessions per period"
            inputMode="numeric"
            value={form.included_sessions}
            onChange={set('included_sessions')}
          />
        </div>
        <fieldset className="flex flex-col gap-xs">
          <legend className="text-sm font-medium text-text">
            Services the free sessions can be used for
          </legend>
          <div className="grid gap-xs sm:grid-cols-2">
            {(services.data ?? [])
              .filter((s) => s.is_active)
              .map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  checked={included.includes(s.id)}
                  onChange={(e) =>
                    setIncluded((ids) =>
                      e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id),
                    )
                  }
                />
              ))}
          </div>
        </fieldset>
        <Textarea label="Rules shown to customers" value={form.rules} onChange={set('rules')} />
        <Checkbox
          label="The discount also applies to products"
          checked={form.applies_to_products}
          onChange={(e) => setForm((f) => ({ ...f, applies_to_products: e.target.checked }))}
        />
        <Checkbox
          label="Open for joining"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} type="submit" disabled={save.isPending}>
            Save plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
