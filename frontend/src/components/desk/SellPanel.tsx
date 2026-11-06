import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import { searchCustomers } from '../../api/customers';
import {
  getDeskCatalogue,
  getDeskCustomerWallet,
  sell,
  type SellInput,
  type SellMethod,
  type SellResult,
} from '../../api/wallet';
import { formatDateTime, formatINR, formatINRExact } from '../../lib/format';
import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../ui';

type Kind = 'package' | 'membership' | 'gift_card';

const KINDS = [
  { value: 'package', label: 'A package' },
  { value: 'membership', label: 'A membership' },
  { value: 'gift_card', label: 'A gift card' },
];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
];

/** Counter: sell a package, a membership (or renewal) or a gift card and take the payment. */
export function SellPanel() {
  const toast = useToast();
  const catalogue = useQuery({ queryKey: ['desk-wallet-catalogue'], queryFn: getDeskCatalogue });
  const [kind, setKind] = useState<Kind>('package');
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [item, setItem] = useState('');
  const [renewal, setRenewal] = useState(false);
  const [method, setMethod] = useState<SellMethod>('cash');
  const [amount, setAmount] = useState('1000');
  const [buyer, setBuyer] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState<SellResult | null>(null);

  const found = useQuery({
    queryKey: ['desk-wallet-customers', search],
    queryFn: () => searchCustomers(search),
    enabled: search.trim().length >= 2,
  });
  const held = useQuery({
    queryKey: ['desk-wallet-customer', customer],
    queryFn: () => getDeskCustomerWallet(customer),
    enabled: customer !== '' && kind !== 'gift_card',
  });

  const save = useMutation({
    mutationFn: (body: SellInput) => sell(body),
    onSuccess: (result) => {
      setDone(result);
      setItem('');
      toast.show({ tone: 'success', title: `Sale ${result.sale.number} recorded` });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not complete the sale.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind !== 'gift_card' && !customer) return setProblem('Find and choose the customer first.');
    if (kind === 'package' && !item) return setProblem('Choose the package.');
    if (kind === 'membership' && !renewal && !item) return setProblem('Choose the plan.');
    if (kind === 'gift_card') {
      const value = Number(amount);
      if (!(value >= 100 && value <= 50000))
        return setProblem('A gift card is worth ₹100 to ₹50,000.');
    }
    setProblem('');
    const base = { method, customer: customer || null };
    if (kind === 'package') save.mutate({ ...base, kind: 'package', package: item });
    else if (kind === 'membership')
      save.mutate(
        renewal
          ? { ...base, kind: 'membership_renewal' }
          : { ...base, kind: 'membership', plan: item },
      );
    else
      save.mutate({
        ...base,
        kind: 'gift_card',
        amount,
        buyer_name: buyer.trim(),
        recipient_name: recipient.trim(),
        recipient_email: recipientEmail.trim(),
        message: message.trim(),
      });
  };

  if (catalogue.isPending) return <LoadingState label="Loading what is on sale…" />;
  if (catalogue.isError)
    return (
      <ErrorState
        description="We couldn't load packages and plans."
        onRetry={() => void catalogue.refetch()}
      />
    );

  const items =
    kind === 'package'
      ? catalogue.data.packages.map((p) => ({
          value: p.id,
          label: `${p.name} · ${formatINR(p.price)}`,
        }))
      : catalogue.data.plans.map((p) => ({
          value: p.id,
          label: `${p.name} · ${formatINR(p.price)}`,
        }));

  return (
    <Card variant="dense" as="section" aria-label="Sell at the counter">
      <h2 className="text-lg font-semibold text-text">Sell at the counter</h2>
      <p className="mt-1 text-sm text-text-muted">
        Packages, memberships and gift cards paid in cash, card or UPI. They are part of
        today&apos;s till at cash close.
      </p>
      <form noValidate onSubmit={submit} className="mt-md flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Select
            label="Sell"
            value={kind}
            options={KINDS}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setItem('');
              setRenewal(false);
              setProblem('');
            }}
          />
          <Select
            label="Paid by"
            value={method}
            options={METHODS}
            onChange={(e) => setMethod(e.target.value as SellMethod)}
          />
        </div>
        <div className="grid gap-md sm:grid-cols-2">
          <Input
            label={kind === 'gift_card' ? 'Buyer (optional, search)' : 'Find the customer'}
            hint="Type at least 2 letters of the name, phone or email."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label={kind === 'gift_card' ? 'Buyer account' : 'Customer'}
            value={customer}
            placeholder={found.isFetching ? 'Searching…' : 'Choose'}
            options={(found.data?.results ?? []).map((c) => ({
              value: c.id,
              label: `${c.full_name} · ${c.email}`,
            }))}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </div>
        {kind === 'membership' && held.data?.membership && (
          <label className="flex items-center gap-sm text-sm text-text">
            <input
              type="checkbox"
              checked={renewal}
              onChange={(e) => setRenewal(e.target.checked)}
            />
            Renew their current {held.data.membership.plan_name} membership instead
          </label>
        )}
        {kind !== 'gift_card' && !renewal && (
          <Select
            label={kind === 'package' ? 'Package' : 'Plan'}
            value={item}
            placeholder={kind === 'package' ? 'Choose a package' : 'Choose a plan'}
            options={items}
            onChange={(e) => setItem(e.target.value)}
          />
        )}
        {kind !== 'gift_card' && held.data && (
          <p className="text-sm text-text-muted">
            This customer has {held.data.sessions_total} package session(s) left
            {held.data.membership ? ` and a ${held.data.membership.plan_name} membership` : ''}.
          </p>
        )}
        {kind === 'gift_card' && (
          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Amount (₹)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="Buyer's name (if no account)"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
            />
            <Input
              label="Recipient's name (optional)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <Input
              label="Recipient's email (optional)"
              type="email"
              hint="We email them the code."
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Message (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div>
          <Button type="submit" loading={save.isPending}>
            Take payment and sell
          </Button>
        </div>
      </form>
      {done && (
        <Modal open onClose={() => setDone(null)} title={`Sale ${done.sale.number}`}>
          <div className="flex flex-col gap-md">
            <p className="text-sm text-text">
              {done.sale.description}: {formatINRExact(done.sale.amount)} (
              {formatDateTime(done.sale.created_at)})
            </p>
            {done.code && (
              <>
                <p className="text-sm text-text-muted">
                  Give the customer this code now. It is shown only once; afterwards only the last 4
                  characters are visible.
                </p>
                <p
                  data-testid="gift-code"
                  className="break-all rounded-nested bg-primary-soft p-md text-center font-mono text-lg font-semibold text-text"
                >
                  {done.code}
                </p>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-sm">
              {done.code && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(done.code ?? '')}
                >
                  <Copy className="size-4" aria-hidden /> Copy code
                </Button>
              )}
              <Button type="button" onClick={() => setDone(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
