import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import { searchCustomers } from '../../../api/customers';
import {
  issuePrivateCoupons,
  listPrivateCoupons,
  withdrawPrivateCoupon,
  type CouponKind,
  type PrivateCoupon,
  type PrivateState,
} from '../../../api/marketing';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  useToast,
  type BadgeTone,
} from '../../ui';

const STATE: Record<PrivateState, { label: string; tone: BadgeTone }> = {
  ready: { label: 'Ready to use', tone: 'success' },
  used: { label: 'Used', tone: 'info' },
  expired: { label: 'Expired', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'warning' },
};

/** A private coupon has its own code, belongs to one customer, and works once. */
export function PrivateCouponsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['mk-private'], queryFn: listPrivateCoupons });
  const [issuing, setIssuing] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['mk-private'] });
  const withdraw = useMutation({
    mutationFn: (c: PrivateCoupon) => withdrawPrivateCoupon(c.id),
    onSuccess: (c) => {
      refresh();
      toast.show({ tone: 'success', title: `${c.code} withdrawn` });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not withdraw it',
        description: errorDetail(error) ?? undefined,
      }),
  });
  return (
    <Card variant="dense" as="section" aria-label="Private coupons">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Private coupons</h2>
          <p className="mt-1 text-sm text-text-muted">
            Each customer gets their own code. It works for that customer only, once, until the last
            day. It is emailed only to customers who agreed to marketing; the others can still see
            it in their wallet.
          </p>
        </div>
        <Button type="button" onClick={() => setIssuing(true)}>
          <Plus className="size-4" aria-hidden /> Issue coupons
        </Button>
      </div>
      <div className="mt-md">
        {list.isPending ? (
          <LoadingState label="Loading private coupons…" />
        ) : list.isError ? (
          <ErrorState
            description="We couldn't load the private coupons."
            onRetry={() => void list.refetch()}
          />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="No private coupons yet"
            description="Issue a coupon to one customer, or to a whole group."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {list.data.map((c) => (
              <li key={c.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-mono font-medium text-text">{c.code}</p>
                  <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
                </div>
                <p className="mt-xs text-sm text-text">
                  {c.name} · {c.description}
                </p>
                <p className="mt-xs text-xs text-text-muted">
                  For {c.customer_name} ({c.customer_email})
                  {c.ends_on ? ` · valid until ${c.ends_on}` : ''}
                </p>
                {c.state === 'ready' && (
                  <div className="mt-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      loading={withdraw.isPending && withdraw.variables?.id === c.id}
                      onClick={() => withdraw.mutate(c)}
                    >
                      Withdraw
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {issuing && (
        <IssueForm
          onClose={() => setIssuing(false)}
          onDone={() => {
            setIssuing(false);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

interface Chosen {
  id: string;
  label: string;
}

function IssueForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    prefix: 'VIP',
    kind: 'flat' as CouponKind,
    value: '',
    min_bill: '0',
    ends_on: '',
    who: 'chosen' as 'chosen' | 'all' | 'recent' | 'lapsed',
  });
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Chosen[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const search = useMutation({
    mutationFn: () => searchCustomers(term.trim()),
    onSuccess: (data) =>
      setFound(
        data.results
          .filter((r) => !chosen.some((c) => c.id === r.id))
          .map((r) => ({ id: r.id, label: `${r.full_name} (${r.email})` })),
      ),
  });
  const save = useMutation({
    mutationFn: () =>
      issuePrivateCoupons({
        name: form.name.trim(),
        prefix: form.prefix.trim(),
        kind: form.kind,
        value: form.value,
        min_bill: form.min_bill || '0',
        applies_to: 'all',
        ends_on: form.ends_on,
        ...(form.who === 'chosen' ? { customers: chosen.map((c) => c.id) } : { segment: form.who }),
      }),
    onSuccess: (result) => {
      toast.show({
        tone: 'success',
        title: `${result.issued} coupon${result.issued === 1 ? '' : 's'} issued`,
        description: `${result.emailed} emailed.`,
      });
      onDone();
    },
    onError: (error) => {
      setFields(serverFieldErrors(error));
      setProblem(errorDetail(error) ?? 'Could not issue the coupons.');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFields({});
    setProblem('');
    save.mutate();
  };
  return (
    <Modal busy={save.isPending} open onClose={onClose} title="Issue private coupons" size="md">
      <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
        <Input
          label="Coupon name"
          value={form.name}
          maxLength={80}
          error={fields.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="grid gap-md sm:grid-cols-2">
          <Input
            label="Code starts with"
            value={form.prefix}
            maxLength={8}
            error={fields.prefix}
            hint="Letters and numbers, then a random part."
            onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
          />
          <Input
            label="Last day"
            type="date"
            value={form.ends_on}
            error={fields.ends_on}
            onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))}
          />
          <Select
            label="Type"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CouponKind }))}
            options={[
              { value: 'flat', label: 'Rupees off' },
              { value: 'percent', label: 'Percent off' },
            ]}
          />
          <Input
            label={form.kind === 'flat' ? 'Amount off (₹)' : 'Percent off'}
            inputMode="decimal"
            value={form.value}
            error={fields.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          />
          <Input
            label="Smallest bill (₹)"
            inputMode="decimal"
            value={form.min_bill}
            error={fields.min_bill}
            onChange={(e) => setForm((f) => ({ ...f, min_bill: e.target.value }))}
          />
          <Select
            label="Who gets one"
            value={form.who}
            onChange={(e) => setForm((f) => ({ ...f, who: e.target.value as typeof form.who }))}
            options={[
              { value: 'chosen', label: 'Customers I pick' },
              { value: 'all', label: 'All customers who agreed to marketing' },
              { value: 'recent', label: 'Recent visitors who agreed to marketing' },
              { value: 'lapsed', label: 'Lapsed customers who agreed to marketing' },
            ]}
          />
        </div>
        {form.who === 'chosen' && (
          <div className="flex flex-col gap-sm">
            <div className="flex items-end gap-sm">
              <div className="grow">
                <Input
                  label="Find a customer"
                  value={term}
                  placeholder="Name, email or phone"
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={search.isPending}
                onClick={() => search.mutate()}
              >
                Search
              </Button>
            </div>
            {found.length > 0 && (
              <ul aria-label="Search results" className="flex flex-col gap-xs">
                {found.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-sm text-sm">
                    <span className="text-text">{c.label}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setChosen((list) => [...list, c]);
                        setFound((list) => list.filter((x) => x.id !== c.id));
                      }}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <ul aria-label="Chosen customers" className="flex flex-wrap gap-xs">
              {chosen.map((c) => (
                <li key={c.id}>
                  <Badge tone="primary">
                    {c.label}{' '}
                    <button
                      type="button"
                      aria-label={`Remove ${c.label}`}
                      className="ml-1"
                      onClick={() => setChosen((list) => list.filter((x) => x.id !== c.id))}
                    >
                      ×
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Issue coupons
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
