import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff } from 'lucide-react';
import { useState } from 'react';
import { decideDayOff, listDaysOff, type DayOffRow } from '../../api/admin';
import axios from 'axios';
import { errorDetail } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Table,
  Textarea,
  useToast,
  type BadgeTone,
} from '../ui';
import { formatDateTime, formatDay } from '../../lib/format';

const tone: Record<DayOffRow['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

const range = (row: DayOffRow) =>
  row.start_date === row.end_date
    ? formatDay(row.start_date)
    : `${formatDay(row.start_date)} to ${formatDay(row.end_date)}`;

/** Admin: decide stylists' days-off requests. Approving blocks their schedule. */
export function DaysOffPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ['days-off'], queryFn: listDaysOff });
  const [declining, setDeclining] = useState<DayOffRow | null>(null);
  const [reason, setReason] = useState('');
  const [warning, setWarning] = useState<DayOffRow | null>(null);
  const [problem, setProblem] = useState('');

  const done = (row: DayOffRow) => {
    toast.show({
      tone: 'success',
      title: `${row.stylist.name}: ${row.status_label.toLowerCase()}`,
      description:
        row.status === 'approved' ? 'Their schedule is blocked for those days.' : undefined,
    });
    setDeclining(null);
    setWarning(null);
    setReason('');
    void queryClient.invalidateQueries({ queryKey: ['days-off'] });
    void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  };

  const decide = useMutation({
    mutationFn: (vars: {
      row: DayOffRow;
      decision: 'approve' | 'decline';
      reason?: string;
      acknowledge?: boolean;
    }) =>
      decideDayOff(vars.row.id, {
        decision: vars.decision,
        reason: vars.reason,
        acknowledge_conflicts: vars.acknowledge,
      }),
    onSuccess: done,
    onError: (error, vars) => {
      const code = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string } | undefined)?.code
        : undefined;
      if (code === 'visits' && vars.decision === 'approve' && !vars.acknowledge) {
        setWarning(vars.row);
        return;
      }
      setProblem(errorDetail(error) ?? 'Could not save the decision. Please try again.');
      void queryClient.invalidateQueries({ queryKey: ['days-off'] });
    },
  });

  const pending = rows.data?.filter((r) => r.status === 'pending').length ?? 0;

  return (
    <section aria-labelledby="daysoff-title" className="flex flex-col gap-md">
      <h2 id="daysoff-title" className="flex items-center gap-sm text-lg font-semibold text-text">
        <CalendarOff aria-hidden="true" className="h-5 w-5 text-primary-hover" /> Days off
        {pending > 0 && <Badge tone="warning">{pending} waiting</Badge>}
      </h2>
      {rows.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading requests…" />
        </Card>
      ) : rows.isError ? (
        <Card variant="dense">
          <ErrorState
            description="We couldn't load the requests."
            onRetry={() => void rows.refetch()}
          />
        </Card>
      ) : rows.data.length === 0 ? (
        <Card variant="dense">
          <EmptyState
            icon={<CalendarOff className="h-6 w-6" />}
            title="No days-off requests"
            description="When a stylist asks for time off, it appears here."
          />
        </Card>
      ) : (
        <Table
          caption="Days-off requests"
          rows={rows.data}
          rowKey={(row) => row.id}
          columns={[
            { key: 'who', header: 'Stylist', render: (row) => row.stylist.name },
            {
              key: 'when',
              header: 'Days',
              render: (row) => (
                <div>
                  <p>{range(row)}</p>
                  {row.reason && <p className="text-xs text-text-muted">{row.reason}</p>}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <div className="flex flex-col gap-1">
                  <Badge tone={tone[row.status]}>{row.status_label}</Badge>
                  {row.decision_note && (
                    <span className="text-xs text-text-muted">{row.decision_note}</span>
                  )}
                  {row.conflicts.length > 0 && (
                    <span className="text-xs font-medium text-warning-text">
                      {row.conflicts.length} booked visit(s) in these days
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right',
              render: (row) =>
                row.status === 'pending' ? (
                  <div className="flex justify-end gap-sm">
                    <Button
                      size="sm"
                      loading={decide.isPending && decide.variables?.row.id === row.id}
                      onClick={() => {
                        setProblem('');
                        decide.mutate({ row, decision: 'approve' });
                      }}
                    >
                      Approve<span className="sr-only"> {row.stylist.name}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setProblem('');
                        setDeclining(row);
                      }}
                    >
                      Decline<span className="sr-only"> {row.stylist.name}</span>
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">
                    {row.decided_by ? `By ${row.decided_by}` : '—'}
                  </span>
                ),
            },
          ]}
        />
      )}

      <Modal
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title="Decline this request?"
        description={declining ? `${declining.stylist.name}, ${range(declining)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => {
                if (reason.trim().length < 3) return setProblem('Give a short reason.');
                if (declining)
                  decide.mutate({ row: declining, decision: 'decline', reason: reason.trim() });
              }}
            >
              Decline request
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason (the stylist sees this)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {problem && (
          <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </Modal>

      <Modal
        open={warning !== null}
        onClose={() => setWarning(null)}
        title="There are visits on those days"
        description={warning ? `${warning.stylist.name}, ${range(warning)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWarning(null)}>
              Not now
            </Button>
            <Button
              loading={decide.isPending}
              onClick={() =>
                warning && decide.mutate({ row: warning, decision: 'approve', acknowledge: true })
              }
            >
              Approve anyway
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          These visits stay booked. The front desk must move them to someone else.
        </p>
        <ul className="mt-sm flex flex-col gap-1 text-sm text-text">
          {warning?.conflicts.map((visit) => (
            <li key={visit.id}>
              {formatDateTime(visit.start)} · {visit.service_name} · {visit.customer_name}
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
