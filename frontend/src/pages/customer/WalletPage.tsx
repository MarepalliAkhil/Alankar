import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Gift } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  buyGiftCard,
  buyPackage,
  cancelMembership,
  checkMyGiftCard,
  getMyCoupons,
  getMyWallet,
  joinMembership,
  renewMembership,
  revealMyGiftCardCode,
  type GiftCardRow,
  type MyWallet,
} from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINR, formatINRExact } from '../../lib/format';

/** Customer: my packages, membership and gift cards, and buying more (test payment). */
export default function WalletPage() {
  useDocumentTitle('My Wallet');
  const wallet = useQuery({ queryKey: ['my-wallet'], queryFn: getMyWallet });
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="My Wallet"
        description="Your packages, membership and gift cards. Payments here are a test: no real money moves."
      />
      {wallet.isPending ? (
        <LoadingState label="Loading your wallet…" />
      ) : wallet.isError ? (
        <ErrorState
          description="We couldn't load your wallet."
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <>
          <MembershipSection wallet={wallet.data} />
          <PackagesSection wallet={wallet.data} />
          <GiftCardsSection wallet={wallet.data} />
          <CouponsSection />
        </>
      )}
    </section>
  );
}

/** Private coupons issued to this customer: one use each, shown only to them. */
function CouponsSection() {
  const coupons = useQuery({ queryKey: ['my-coupons'], queryFn: getMyCoupons });
  return (
    <Card variant="dense" as="section" aria-label="My coupons">
      <h2 className="text-lg font-semibold text-text">My coupons</h2>
      <p className="mt-1 text-sm text-text-muted">
        Show the code at the counter. Each coupon works once, for you only.
      </p>
      <div className="mt-md">
        {coupons.isPending ? (
          <LoadingState label="Loading your coupons…" />
        ) : coupons.isError ? (
          <ErrorState
            description="We couldn't load your coupons."
            onRetry={() => void coupons.refetch()}
          />
        ) : coupons.data.length === 0 ? (
          <EmptyState
            title="No coupons right now"
            description="Offers made just for you appear here."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {coupons.data.map((c) => (
              <li key={c.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-mono font-medium text-text">{c.code}</p>
                  <Badge tone={c.state === 'ready' ? 'success' : 'neutral'}>
                    {c.state === 'ready' ? 'Ready to use' : c.state === 'used' ? 'Used' : 'Expired'}
                  </Badge>
                </div>
                <p className="mt-xs text-sm text-text">
                  {c.name} · {c.description}
                </p>
                {c.ends_on && <p className="text-xs text-text-muted">Valid until {c.ends_on}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['my-wallet'] });
}

function MembershipSection({ wallet }: { wallet: MyWallet }) {
  const toast = useToast();
  const refresh = useRefresh();
  const m = wallet.membership;
  const fail = (error: unknown) =>
    toast.show({
      tone: 'danger',
      title: 'That did not go through',
      description: genericErrorMessage(error, 'No money was taken. You can try again.'),
    });
  const join = useMutation({
    mutationFn: (v: { plan: string; outcome: 'success' | 'fail' }) =>
      joinMembership(v.plan, v.outcome),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Welcome, you are a member now' });
    },
    onError: fail,
  });
  const renew = useMutation({
    mutationFn: () => renewMembership(),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Membership renewed' });
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => cancelMembership(),
    onSuccess: () => {
      refresh();
      toast.show({
        tone: 'success',
        title: 'Membership cancelled',
        description: 'You keep the benefits until the period ends.',
      });
    },
    onError: fail,
  });
  return (
    <Card variant="dense" as="section" aria-label="Membership">
      <h2 className="text-lg font-semibold text-text">Membership</h2>
      {m ? (
        <div className="mt-sm flex flex-col gap-xs">
          <div className="flex flex-wrap items-center gap-xs">
            <p className="font-semibold text-text">{m.plan_name}</p>
            <Badge tone={m.status === 'active' ? 'success' : 'warning'}>{m.status_label}</Badge>
          </div>
          <p className="text-sm text-text-muted">
            {Number(m.discount_percent)}% off every bill
            {m.applies_to_products ? ' including products' : ''}
            {m.included_sessions > 0
              ? ` · ${m.sessions_left} of ${m.included_sessions} free session(s) left`
              : ''}
          </p>
          <p className="text-sm text-text-muted">
            {m.status === 'cancelled' ? 'Benefits end' : 'Renews or ends'}{' '}
            {formatDateTime(m.period_end)}
          </p>
          <div className="mt-xs flex flex-wrap gap-sm">
            {m.can_renew && (
              <Button
                type="button"
                size="sm"
                loading={renew.isPending}
                onClick={() => renew.mutate()}
              >
                Renew now ({formatINR(m.price)})
              </Button>
            )}
            {m.status === 'active' && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel membership
              </Button>
            )}
          </div>
        </div>
      ) : wallet.catalogue.plans.length === 0 ? (
        <EmptyState title="No plans open right now" description="Please check again soon." />
      ) : (
        <ul className="mt-sm flex flex-col gap-sm">
          {wallet.catalogue.plans.map((p) => (
            <li key={p.id} className="rounded-nested border border-border p-md">
              <p className="font-semibold text-text">{p.name}</p>
              <p className="text-sm text-text-muted">
                {formatINR(p.price)} per{' '}
                {p.period_months === 12 ? 'year' : `${p.period_months} month(s)`} ·{' '}
                {Number(p.discount_percent)}% off every bill
                {p.included_sessions > 0
                  ? ` · ${p.included_sessions} free session(s) each period`
                  : ''}
              </p>
              {p.rules && <p className="mt-xs text-xs text-text-muted">{p.rules}</p>}
              <div className="mt-sm flex flex-wrap gap-sm">
                <Button
                  type="button"
                  size="sm"
                  loading={join.isPending}
                  onClick={() => join.mutate({ plan: p.id, outcome: 'success' })}
                >
                  Join for {formatINR(p.price)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={join.isPending}
                  onClick={() => join.mutate({ plan: p.id, outcome: 'fail' })}
                >
                  Simulate failed payment
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PackagesSection({ wallet }: { wallet: MyWallet }) {
  const toast = useToast();
  const refresh = useRefresh();
  const buy = useMutation({
    mutationFn: (v: { id: string; outcome: 'success' | 'fail' }) => buyPackage(v.id, v.outcome),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Package bought' });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Payment did not go through',
        description: genericErrorMessage(error, 'No money was taken. You can try again.'),
      }),
  });
  return (
    <Card variant="dense" as="section" aria-label="Packages">
      <h2 className="text-lg font-semibold text-text">Packages</h2>
      <h3 className="mt-sm text-sm font-semibold text-text">What I have</h3>
      {wallet.packages.length === 0 ? (
        <p className="mt-xs text-sm text-text-muted">You have not bought a package yet.</p>
      ) : (
        <ul className="mt-xs flex flex-col gap-sm">
          {wallet.packages.map((p) => (
            <li key={p.id} className="rounded-nested border border-border p-md">
              <div className="flex flex-wrap items-center gap-xs">
                <p className="font-semibold text-text">{p.name}</p>
                <Badge tone={p.remaining > 0 ? 'success' : 'neutral'}>{p.remaining} left</Badge>
              </div>
              <p className="text-sm text-text-muted">
                {p.credits
                  .map((c) => `${c.remaining} of ${c.quantity} ${c.service_name}`)
                  .join(', ')}
              </p>
              <p className="text-xs text-text-muted">Use by {formatDateTime(p.expires_at)}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-md text-sm font-semibold text-text">Buy a package</h3>
      {wallet.catalogue.packages.length === 0 ? (
        <p className="mt-xs text-sm text-text-muted">No packages are on sale right now.</p>
      ) : (
        <ul className="mt-xs flex flex-col gap-sm">
          {wallet.catalogue.packages.map((p) => (
            <li key={p.id} className="rounded-nested border border-border p-md">
              <p className="font-semibold text-text">{p.name}</p>
              <p className="text-sm text-text-muted">
                {p.items.map((i) => `${i.quantity} × ${i.service_name}`).join(', ')} · valid{' '}
                {p.validity_days} days
              </p>
              {p.description && <p className="text-xs text-text-muted">{p.description}</p>}
              <div className="mt-sm flex flex-wrap gap-sm">
                <Button
                  type="button"
                  size="sm"
                  loading={buy.isPending}
                  onClick={() => buy.mutate({ id: p.id, outcome: 'success' })}
                >
                  Buy for {formatINR(p.price)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={buy.isPending}
                  onClick={() => buy.mutate({ id: p.id, outcome: 'fail' })}
                >
                  Simulate failed payment
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function cardState(c: GiftCardRow): string {
  if (c.status === 'void') return 'Cancelled';
  if (c.expired) return 'Expired';
  if (Number(c.balance) <= 0) return 'Used up';
  return 'Active';
}

function GiftCardsSection({ wallet }: { wallet: MyWallet }) {
  const refresh = useRefresh();
  const [buying, setBuying] = useState(false);
  const [issued, setIssued] = useState<{ code: string; card: GiftCardRow } | null>(null);
  return (
    <Card variant="dense" as="section" aria-label="Gift cards">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <h2 className="text-lg font-semibold text-text">Gift cards</h2>
        <Button type="button" size="sm" onClick={() => setBuying(true)}>
          <Gift className="size-4" aria-hidden /> Buy a gift card
        </Button>
      </div>
      {wallet.gift_cards.length === 0 ? (
        <p className="mt-sm text-sm text-text-muted">
          Gift cards you buy or receive show here. Use the code when you pay for a booking.
        </p>
      ) : (
        <ul className="mt-sm flex flex-col gap-sm">
          {wallet.gift_cards.map((c) => (
            <GiftCardCard key={c.id} card={c} />
          ))}
        </ul>
      )}
      <CheckCard />
      {buying && (
        <BuyGiftCardModal
          onClose={() => setBuying(false)}
          onIssued={(code, card) => {
            setBuying(false);
            setIssued({ code, card });
            refresh();
          }}
        />
      )}
      {issued && (
        <Modal open onClose={() => setIssued(null)} title="Your gift card">
          <div className="flex flex-col gap-md">
            <p className="text-sm text-text-muted">
              Keep this code safe. It is shown only now; after you close this window only the last 4
              characters are kept. If you named a recipient, we emailed them the code too.
            </p>
            <p
              className="break-all rounded-nested bg-primary-soft p-md text-center font-mono text-lg font-semibold text-text"
              data-testid="gift-code"
            >
              {issued.code}
            </p>
            <p className="text-sm text-text-muted">
              Worth {formatINRExact(issued.card.initial_amount)}, valid until{' '}
              {formatDateTime(issued.card.expires_at)}.
            </p>
            <div className="flex flex-wrap justify-end gap-sm">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(issued.code)}
              >
                <Copy className="size-4" aria-hidden /> Copy code
              </Button>
              <Button type="button" onClick={() => setIssued(null)}>
                I have saved it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/** One gift card: masked by default, with Show/Hide + Copy for the full code and a usage ledger. */
function GiftCardCard({ card: c }: { card: GiftCardRow }) {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const reveal = useMutation({
    mutationFn: () => revealMyGiftCardCode(c.id),
    onSuccess: (r) => setCode(r.code),
    onError: (error: unknown) =>
      toast.show({
        tone: 'danger',
        title: "Can't show the code",
        description: genericErrorMessage(
          error,
          'This card’s code was only shown once, when it was issued.',
        ),
      }),
  });
  return (
    <li className="rounded-nested border border-border p-md">
      <div className="flex flex-wrap items-center gap-xs">
        <p className="font-mono font-semibold text-text" data-testid="giftcard-code-display">
          {code ?? c.masked}
        </p>
        <Badge tone={cardState(c) === 'Active' ? 'success' : 'neutral'}>{cardState(c)}</Badge>
        <span className="text-sm text-text-muted">
          {c.role === 'received' ? 'Received' : 'Bought'}
        </span>
      </div>
      <p className="text-sm text-text-muted">
        {formatINRExact(c.usable_balance)} to spend · expires {formatDateTime(c.expires_at)}
      </p>
      <div className="mt-xs flex flex-wrap items-center gap-xs">
        {c.code_available ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => (code ? setCode(null) : reveal.mutate())}
            disabled={reveal.isPending}
          >
            {code ? (
              <>
                <EyeOff className="size-4" aria-hidden /> Hide code
              </>
            ) : (
              <>
                <Eye className="size-4" aria-hidden /> Show code
              </>
            )}
          </Button>
        ) : (
          <span className="text-xs text-text-muted">Code was shown once, at purchase</span>
        )}
        {code && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(code ?? '')}
          >
            <Copy className="size-4" aria-hidden /> Copy
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowLedger((v) => !v)}>
          {showLedger ? (
            <>
              <ChevronUp className="size-4" aria-hidden /> Hide history
            </>
          ) : (
            <>
              <ChevronDown className="size-4" aria-hidden /> History
            </>
          )}
        </Button>
      </div>
      {showLedger && (
        <ul className="mt-sm flex flex-col gap-xs border-t border-border pt-sm">
          {(c.ledger ?? []).length === 0 ? (
            <li className="text-xs text-text-muted">No activity yet.</li>
          ) : (
            c.ledger!.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-xs text-xs">
                <span className="text-text">
                  {e.reason_label}
                  {e.note ? ` — ${e.note}` : ''}
                </span>
                <span className="text-text-muted">
                  {formatINRExact(e.delta)} · {formatDateTime(e.created_at)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function CheckCard() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [bad, setBad] = useState(false);
  const check = useMutation({
    mutationFn: () => checkMyGiftCard(code),
    onSuccess: (r) => {
      setBad(false);
      setMessage(
        `${r.masked}: ${formatINRExact(r.balance)} to spend, expires ${formatDateTime(r.expires_at)}.`,
      );
    },
    onError: (error) => {
      setBad(true);
      setMessage(genericErrorMessage(error, 'That gift card code is not valid.'));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      setBad(true);
      return setMessage('Type the gift card code first.');
    }
    check.mutate();
  };
  return (
    <form noValidate onSubmit={submit} className="mt-md flex flex-col gap-xs">
      <Input
        label="Check a gift card balance"
        hint="Too many wrong codes pauses checking for 15 minutes."
        value={code}
        autoComplete="off"
        onChange={(e) => setCode(e.target.value)}
      />
      <div>
        <Button type="submit" size="sm" variant="secondary" loading={check.isPending}>
          Check balance
        </Button>
      </div>
      {message && (
        <p
          role={bad ? 'alert' : 'status'}
          className={bad ? 'text-sm font-medium text-danger-text' : 'text-sm text-text'}
        >
          {message}
        </p>
      )}
    </form>
  );
}

function BuyGiftCardModal({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (code: string, card: GiftCardRow) => void;
}) {
  const [form, setForm] = useState({
    amount: '1000',
    recipient_name: '',
    recipient_email: '',
    message: '',
  });
  const [problem, setProblem] = useState('');
  const buy = useMutation({
    mutationFn: (outcome: 'success' | 'fail') =>
      buyGiftCard({
        amount: form.amount,
        recipient_name: form.recipient_name.trim(),
        recipient_email: form.recipient_email.trim(),
        message: form.message.trim(),
        outcome,
      }),
    onSuccess: (r) => onIssued(r.code, r.card),
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'The payment did not go through. No money was taken.')),
  });
  const go = (outcome: 'success' | 'fail') => {
    const amount = Number(form.amount);
    if (!(amount >= 100 && amount <= 50000))
      return setProblem('Choose an amount from ₹100 to ₹50,000.');
    if (form.recipient_email && !/^\S+@\S+\.\S+$/.test(form.recipient_email))
      return setProblem('That email address does not look right.');
    setProblem('');
    buy.mutate(outcome);
  };
  return (
    <Modal open onClose={onClose} title="Buy a gift card" size="md">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          go('success');
        }}
        className="flex flex-col gap-md"
      >
        <Input
          label="Amount (₹)"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <Input
          label="Recipient's name (optional)"
          value={form.recipient_name}
          onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
        />
        <Input
          label="Recipient's email (optional)"
          hint="We email them the code. Leave empty to keep it for yourself."
          type="email"
          value={form.recipient_email}
          onChange={(e) => setForm((f) => ({ ...f, recipient_email: e.target.value }))}
        />
        <Textarea
          label="Message (optional)"
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-sm">
          <Button type="button" variant="ghost" disabled={buy.isPending} onClick={() => go('fail')}>
            Simulate failed payment
          </Button>
          <Button type="submit" loading={buy.isPending}>
            Pay {formatINR(Number(form.amount) || 0)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
