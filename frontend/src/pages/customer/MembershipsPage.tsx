import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { getMyMemberships } from '../../api/memberships';
import {
  cancelMembership,
  joinMembership,
  renewMembership,
  type MembershipRow,
  type PlanRow,
} from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

const TONE = { active: 'success', cancelled: 'warning', ended: 'neutral' } as const;

/** Customer: the membership (benefits, sessions, renew or cancel), past memberships, and the
 * plans on offer -- to join, or buy again after one ended. Payments are simulated. */
export default function MembershipsPage() {
  useDocumentTitle('Memberships');
  const toast = useToast();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ['my-memberships'], queryFn: getMyMemberships });
  const [cancelling, setCancelling] = useState(false);

  const done = (title: string) => {
    toast.show({ tone: 'success', title });
    void queryClient.invalidateQueries({ queryKey: ['my-memberships'] });
    void queryClient.invalidateQueries({ queryKey: ['my-wallet'] });
  };
  const failed = (error: unknown) =>
    toast.show({
      tone: 'danger',
      title: 'That did not go through',
      description: genericErrorMessage(error, 'Nothing was charged. Please try again.'),
    });
  const join = useMutation({
    mutationFn: (plan: string) => joinMembership(plan),
    onSuccess: (m) => done(`Welcome to ${m.plan_name}`),
    onError: failed,
  });
  const renew = useMutation({
    mutationFn: () => renewMembership(),
    onSuccess: (m) => done(`Renewed until ${formatDateTime(m.period_end)}`),
    onError: failed,
  });
  const cancel = useMutation({
    mutationFn: () => cancelMembership(),
    onSuccess: () => {
      setCancelling(false);
      done('Membership cancelled');
    },
    onError: failed,
  });

  if (page.isPending) return <LoadingState label="Loading your memberships…" />;
  if (page.isError) {
    return (
      <ErrorState
        description="We couldn't load your memberships."
        onRetry={() => void page.refetch()}
      />
    );
  }
  const { current, past, plans } = page.data;
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="Memberships"
        description="Member prices on every visit, plus any included sessions. Payments here are test payments."
      />
      {current ? (
        <Card as="section" className="flex flex-col gap-sm" aria-label="Your membership">
          <div className="flex flex-wrap items-center gap-xs">
            <Crown className="size-5 text-primary-hover" aria-hidden />
            <h2 className="text-lg font-semibold text-text">{current.plan_name}</h2>
            <Badge tone={TONE[current.status]}>{current.status_label}</Badge>
          </div>
          <Benefits m={current} />
          <p className="text-sm text-text">
            {current.status === 'cancelled'
              ? `Cancelled. Your benefits last until ${formatDateTime(current.period_end)}; renew to keep them.`
              : `Runs until ${formatDateTime(current.period_end)}.`}
          </p>
          <div className="flex flex-wrap gap-sm">
            {current.can_renew && (
              <Button type="button" loading={renew.isPending} onClick={() => renew.mutate()}>
                Renew for {formatINRExact(current.price)}
              </Button>
            )}
            {current.status === 'active' && (
              <Button type="button" variant="ghost" onClick={() => setCancelling(true)}>
                Cancel membership
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<Crown className="size-6" aria-hidden />}
          title={past.length ? 'Your membership has ended' : 'No membership yet'}
          description={
            past.length
              ? 'Buy a plan again below to get your member prices back.'
              : 'Pick a plan below to get member prices.'
          }
        />
      )}

      <section aria-label="Plans" className="flex flex-col gap-sm">
        <h2 className="text-lg font-semibold text-text">Plans on offer</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-text-muted">No plans are on offer right now.</p>
        ) : (
          <ul className="grid gap-md sm:grid-cols-2">
            {plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                blocked={current !== null}
                pastPlan={past.some((m) => m.plan_name === p.name)}
                busy={join.isPending}
                onJoin={() => join.mutate(p.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-label="Past memberships" className="flex flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Past memberships</h2>
          <ul className="flex flex-col gap-xs">
            {past.map((m) => (
              <Card as="li" variant="dense" key={m.id}>
                <p className="text-sm text-text">
                  <span className="font-medium">{m.plan_name}</span> · started{' '}
                  {formatDateTime(m.started_at)} · ended{' '}
                  {formatDateTime(m.ended_at ?? m.period_end)}
                </p>
                {m.end_reason && (
                  <p className="text-xs text-text-muted">Ended by the salon: {m.end_reason}</p>
                )}
              </Card>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel your membership?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel membership
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">
          You keep your member prices until {current ? formatDateTime(current.period_end) : ''}. It
          will not renew after that, and you can renew again any time before then.
        </p>
      </Modal>
    </section>
  );
}

function Benefits({ m }: { m: MembershipRow | PlanRow }) {
  const percent = Number(m.discount_percent);
  const sessions = 'sessions_left' in m ? m.sessions_left : m.included_sessions;
  const services =
    'included_services' in m
      ? (m.included_services as (string | { name: string })[]).map((s) =>
          typeof s === 'string' ? s : s.name,
        )
      : [];
  return (
    <ul className="flex flex-col gap-1 text-sm text-text-muted">
      {percent > 0 && (
        <li>
          {percent}% off services{m.applies_to_products ? ' and products' : ''}
        </li>
      )}
      {m.included_sessions > 0 && (
        <li>
          {'sessions_left' in m ? `${sessions} of ${m.included_sessions}` : m.included_sessions}{' '}
          included session{m.included_sessions === 1 ? '' : 's'}
          {services.length ? ` (${services.join(', ')})` : ''}
        </li>
      )}
    </ul>
  );
}

function PlanCard({
  plan,
  blocked,
  pastPlan,
  busy,
  onJoin,
}: {
  plan: PlanRow;
  blocked: boolean;
  pastPlan: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  return (
    <Card as="li" variant="dense" aria-label={plan.name} className="flex flex-col gap-xs">
      <p className="font-semibold text-text">{plan.name}</p>
      {plan.description && <p className="text-sm text-text-muted">{plan.description}</p>}
      <Benefits m={plan} />
      <p className="text-sm text-text">
        {formatINRExact(plan.price)} for {plan.period_months} month
        {plan.period_months === 1 ? '' : 's'}
      </p>
      {!blocked && (
        <Button type="button" size="sm" disabled={busy} onClick={onJoin}>
          {pastPlan ? 'Buy again' : 'Join'}
        </Button>
      )}
    </Card>
  );
}
