import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { endMembership, listMembers, type MemberRow } from '../../api/memberships';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled (running out)' },
  { value: 'ended', label: 'Ended' },
] as const;
type StatusFilter = (typeof STATUSES)[number]['value'];
const TONE = { active: 'success', cancelled: 'warning', ended: 'neutral' } as const;

/** Receptionist (view only) and admin: members with filters. The admin can end a membership
 * early, with a reason. */
export default function MembersPage() {
  useDocumentTitle('Memberships');
  const [status, setStatus] = useState<StatusFilter>('');
  const [plan, setPlan] = useState('');
  const [q, setQ] = useState('');
  const [ending, setEnding] = useState<MemberRow | null>(null);
  const members = useQuery({
    queryKey: ['members', status, plan, q.trim()],
    queryFn: () => listMembers({ status, plan, q: q.trim() }),
  });
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader title="Memberships" description="Who is a member, on which plan, until when." />
      {members.data && (
        <div className="flex flex-wrap gap-sm" role="group" aria-label="Totals">
          <Badge tone="success">{members.data.counts.active ?? 0} active</Badge>
          <Badge tone="warning">{members.data.counts.cancelled ?? 0} cancelled</Badge>
          <Badge tone="neutral">{members.data.counts.ended ?? 0} ended</Badge>
        </div>
      )}
      <Card variant="dense" className="flex flex-col gap-sm">
        <FilterChips label="Status" options={STATUSES} value={status} onChange={setStatus} />
        <div className="grid gap-sm sm:grid-cols-2">
          <Select
            label="Plan"
            placeholder="All plans"
            options={(members.data?.plans ?? []).map((p) => ({ value: p, label: p }))}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          />
          <Input
            label="Search"
            placeholder="Name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>
      {members.isPending ? (
        <SkeletonRows count={4} label="Loading members…" />
      ) : members.isError ? (
        <ErrorState
          description="We couldn't load the members."
          onRetry={() => void members.refetch()}
        />
      ) : members.data.members.length === 0 ? (
        <EmptyState title="No members here" description="Try another filter." />
      ) : (
        <ul className="flex flex-col gap-sm">
          {members.data.members.map((m) => (
            <Card as="li" variant="dense" key={m.id} aria-label={m.customer_name}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="font-semibold text-text">{m.customer_name}</span>
                  <span className="text-sm text-text-muted">{m.customer_email}</span>
                  <Badge tone={TONE[m.status]}>{m.status_label}</Badge>
                </div>
                {m.can_end && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEnding(m)}>
                    End membership
                  </Button>
                )}
              </div>
              <p className="text-sm text-text">
                {m.plan_name} · {Number(m.discount_percent)}% off · {m.sessions_left} session(s)
                left · {m.status === 'ended' ? 'ended' : 'until'}{' '}
                {formatDateTime(m.ended_at ?? m.period_end)}
              </p>
              {m.end_reason && (
                <p className="text-xs text-text-muted">Ended early: {m.end_reason}</p>
              )}
            </Card>
          ))}
        </ul>
      )}
      {ending && <EndModal member={ending} onClose={() => setEnding(null)} />}
    </section>
  );
}

function EndModal({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const end = useMutation({
    mutationFn: () => endMembership(member.id, reason.trim()),
    onSuccess: () => {
      toast.show({ tone: 'success', title: `${member.customer_name}'s membership ended` });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
    onError: (error: unknown) => setProblem(genericErrorMessage(error, 'Could not end it.')),
  });
  return (
    <Modal
      busy={end.isPending}
      open
      onClose={onClose}
      title={`End ${member.customer_name}'s membership?`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={end.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                return setProblem('Give a reason (at least 3 characters).');
              }
              setProblem('');
              end.mutate();
            }}
          >
            End now
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-sm text-text">
          Member prices and included sessions stop at once. No money moves automatically; refund
          anything owed from the refund screens.
        </p>
        <Textarea
          label="Reason"
          required
          value={reason}
          error={problem || undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
