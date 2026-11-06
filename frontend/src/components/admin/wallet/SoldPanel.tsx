import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorDetail } from '../../../api/client';
import {
  listMembers,
  listPurchases,
  listSales,
  refundPackage,
  restoreMembershipUse,
  restorePackageUse,
  type MembershipRow,
  type PurchaseRow,
} from '../../../api/wallet';
import { formatDateTime, formatINRExact } from '../../../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  useToast,
} from '../../ui';
import { ReasonModal } from './ReasonModal';

/** Admin: what has been sold (reconciles with the cash close) and what customers hold. */
export function SalesPanel() {
  const sales = useQuery({ queryKey: ['w-sales'], queryFn: () => listSales() });
  return (
    <Card variant="dense" as="section" aria-label="Sales">
      <h2 className="text-lg font-semibold text-text">Sales</h2>
      <p className="mt-1 text-sm text-text-muted">
        Every package, membership and gift card sold, at the counter or online. Counter sales are
        part of the day&apos;s till at cash close.
      </p>
      <div className="mt-md">
        {sales.isPending ? (
          <LoadingState label="Loading sales…" />
        ) : sales.isError ? (
          <ErrorState
            description="We couldn't load the sales."
            onRetry={() => void sales.refetch()}
          />
        ) : (
          <Table
            caption="Sales"
            rows={sales.data}
            rowKey={(s) => s.id}
            emptyMessage="Nothing sold yet."
            columns={[
              { key: 'n', header: 'Receipt', render: (s) => s.number },
              { key: 'w', header: 'When', render: (s) => formatDateTime(s.created_at) },
              { key: 'k', header: 'What', render: (s) => s.description },
              { key: 'c', header: 'Customer', render: (s) => s.customer_name || '—' },
              {
                key: 'ch',
                header: 'Paid',
                render: (s) => (s.channel === 'online' ? 'Online' : `Counter (${s.method})`),
              },
              { key: 'a', header: 'Amount', render: (s) => formatINRExact(s.amount) },
              {
                key: 'r',
                header: 'Refunded',
                render: (s) => (Number(s.refunded) > 0 ? formatINRExact(s.refunded) : '—'),
              },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

export function PurchasesPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const purchases = useQuery({ queryKey: ['w-purchases'], queryFn: listPurchases });
  const [refunding, setRefunding] = useState<PurchaseRow | null>(null);
  const [restoring, setRestoring] = useState<{ id: string; label: string } | null>(null);
  const [problem, setProblem] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['w-purchases'] });
    void queryClient.invalidateQueries({ queryKey: ['w-sales'] });
  };
  const refund = useMutation({
    mutationFn: (v: { id: string; method: 'cash' | 'card' | 'upi'; reason: string }) =>
      refundPackage(v.id, v.method, v.reason),
    onSuccess: () => {
      setRefunding(null);
      refresh();
      toast.show({ tone: 'success', title: 'Package refunded' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not refund.'),
  });
  const restore = useMutation({
    mutationFn: (v: { id: string; reason: string }) => restorePackageUse(v.id, v.reason),
    onSuccess: () => {
      setRestoring(null);
      refresh();
      toast.show({ tone: 'success', title: 'Session put back' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not restore.'),
  });
  return (
    <Card variant="dense" as="section" aria-label="Packages sold">
      <h2 className="text-lg font-semibold text-text">Packages sold</h2>
      <div className="mt-md">
        {purchases.isPending ? (
          <LoadingState label="Loading purchases…" />
        ) : purchases.isError ? (
          <ErrorState
            description="We couldn't load the purchases."
            onRetry={() => void purchases.refetch()}
          />
        ) : purchases.data.length === 0 ? (
          <EmptyState title="Nothing sold yet" description="Sold packages appear here." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {purchases.data.map((p) => (
              <li key={p.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{p.name}</p>
                  <span className="text-sm text-text-muted">
                    {p.customer_name} · {formatINRExact(p.price_paid)} · {p.sale_number}
                  </span>
                  <Badge tone={p.remaining > 0 ? 'info' : 'neutral'}>{p.remaining} left</Badge>
                  {Number(p.refunded) > 0 && (
                    <Badge tone="warning">Refunded {formatINRExact(p.refunded)}</Badge>
                  )}
                </div>
                <p className="mt-xs text-xs text-text-muted">
                  Valid until {formatDateTime(p.expires_at)} ·{' '}
                  {p.credits
                    .map((c) => `${c.remaining}/${c.quantity} ${c.service_name}`)
                    .join(', ')}
                </p>
                {p.ledger && p.ledger.length > 0 && (
                  <ul
                    className="mt-sm flex flex-col gap-1 text-sm"
                    aria-label={`History of ${p.name}`}
                  >
                    {p.ledger.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-xs text-text-muted">
                        <span>{formatDateTime(e.created_at)}</span>
                        <span>
                          {e.reason_label}: {e.delta > 0 ? `+${e.delta}` : e.delta} {e.service_name}
                        </span>
                        {e.invoice && <span>invoice {e.invoice}</span>}
                        {e.reason === 'used' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setProblem('');
                              setRestoring({
                                id: e.id,
                                label: `${e.service_name} (${e.invoice ?? ''})`,
                              });
                            }}
                          >
                            Put back
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {p.remaining > 0 && (
                  <div className="mt-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setProblem('');
                        setRefunding(p);
                      }}
                    >
                      Refund unused sessions
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {refunding && (
        <ReasonModal
          title={`Refund ${refunding.name}`}
          description={`${refunding.remaining} unused session(s) are paid back at their share of the price. Used sessions are not refunded.`}
          confirmLabel="Refund"
          withMethod
          busy={refund.isPending}
          problem={problem}
          onClose={() => setRefunding(null)}
          onConfirm={(reason, method) => refund.mutate({ id: refunding.id, method, reason })}
        />
      )}
      {restoring && (
        <ReasonModal
          title="Put a session back"
          description={`Gives back the session used for ${restoring.label}.`}
          confirmLabel="Put back"
          busy={restore.isPending}
          problem={problem}
          onClose={() => setRestoring(null)}
          onConfirm={(reason) => restore.mutate({ id: restoring.id, reason })}
        />
      )}
    </Card>
  );
}

export function MembersPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['w-members'], queryFn: listMembers });
  const [restoring, setRestoring] = useState<{ id: string; who: string } | null>(null);
  const [problem, setProblem] = useState('');
  const restore = useMutation({
    mutationFn: (v: { id: string; reason: string }) => restoreMembershipUse(v.id, v.reason),
    onSuccess: () => {
      setRestoring(null);
      void queryClient.invalidateQueries({ queryKey: ['w-members'] });
      toast.show({ tone: 'success', title: 'Session put back' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not restore.'),
  });
  const line = (m: MembershipRow) =>
    `${m.plan_name} · ${Number(m.discount_percent)}% off · ${m.sessions_left}/${m.included_sessions} free sessions · until ${formatDateTime(m.period_end)}`;
  return (
    <Card variant="dense" as="section" aria-label="Members">
      <h2 className="text-lg font-semibold text-text">Members</h2>
      <div className="mt-md">
        {members.isPending ? (
          <LoadingState label="Loading members…" />
        ) : members.isError ? (
          <ErrorState
            description="We couldn't load the members."
            onRetry={() => void members.refetch()}
          />
        ) : members.data.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Members appear here once someone joins."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {members.data.map((m) => (
              <li key={m.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{m.customer_name}</p>
                  <Badge tone={m.status === 'active' ? 'success' : 'neutral'}>
                    {m.status_label}
                  </Badge>
                </div>
                <p className="mt-xs text-sm text-text-muted">{line(m)}</p>
                {m.ledger && m.ledger.length > 0 && (
                  <ul
                    className="mt-sm flex flex-col gap-1 text-sm"
                    aria-label={`History of ${m.customer_name}`}
                  >
                    {m.ledger.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-xs text-text-muted">
                        <span>{formatDateTime(e.created_at)}</span>
                        <span>
                          {e.reason_label}
                          {e.sessions_change !== 0 &&
                            ` (${e.sessions_change > 0 ? '+' : ''}${e.sessions_change})`}
                        </span>
                        {e.invoice && <span>invoice {e.invoice}</span>}
                        {e.reason === 'used' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setProblem('');
                              setRestoring({ id: e.id, who: m.customer_name ?? '' });
                            }}
                          >
                            Put back
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoring && (
        <ReasonModal
          title="Put a session back"
          description={`Gives ${restoring.who} the included session back.`}
          confirmLabel="Put back"
          busy={restore.isPending}
          problem={problem}
          onClose={() => setRestoring(null)}
          onConfirm={(reason) => restore.mutate({ id: restoring.id, reason })}
        />
      )}
    </Card>
  );
}
