import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { useState } from 'react';
import { listCashCloses, reviewCashClose, type CashCloseRow } from '../../api/adminOps';
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
} from '../ui';
import { formatDay, formatINRExact } from '../../lib/format';

/** Admin: the receptionists' signed-off cash closes, to be marked reviewed. */
export function CashClosesPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['cash-closes'], queryFn: listCashCloses });
  const [reviewing, setReviewing] = useState<CashCloseRow | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const review = useMutation({
    mutationFn: () => reviewCashClose(reviewing!.id, note.trim()),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Marked as reviewed' });
      setReviewing(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['cash-closes'] });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save. Please try again.'),
  });

  if (list.isPending) return <LoadingState label="Loading cash closes…" />;
  if (list.isError) {
    return (
      <ErrorState
        description="We couldn't load the cash closes."
        onRetry={() => void list.refetch()}
      />
    );
  }
  if (list.data.results.length === 0) {
    return (
      <EmptyState
        icon={<Landmark className="h-6 w-6" />}
        title="No cash closes yet"
        description="When a receptionist signs off the day, it appears here for your review."
      />
    );
  }
  return (
    <div className="flex flex-col gap-md">
      {list.data.waiting > 0 && (
        <p role="status" className="text-sm text-text-muted">
          {list.data.waiting} waiting for review
          {list.data.waiting_with_difference > 0 &&
            `, ${list.data.waiting_with_difference} with a cash difference`}
          .
        </p>
      )}
      <Table
        caption="Cash closes"
        rows={list.data.results}
        rowKey={(row) => row.id}
        columns={[
          { key: 'date', header: 'Day', render: (row) => formatDay(row.date) },
          {
            key: 'cash',
            header: 'Cash expected / counted',
            render: (row) =>
              `${formatINRExact(row.expected_cash)} / ${formatINRExact(row.counted_cash)}`,
          },
          {
            key: 'diff',
            header: 'Difference',
            render: (row) =>
              Number(row.difference) === 0 ? (
                <Badge tone="success">None</Badge>
              ) : (
                <Badge tone="danger">{formatINRExact(row.difference)}</Badge>
              ),
          },
          {
            key: 'by',
            header: 'Closed by',
            render: (row) => (
              <div>
                <p>{row.closed_by || '—'}</p>
                {row.note && <p className="text-xs text-text-muted">{row.note}</p>}
              </div>
            ),
          },
          {
            key: 'state',
            header: 'Review',
            className: 'text-right',
            render: (row) =>
              row.reviewed ? (
                <div className="text-right">
                  <Badge tone="success">Reviewed</Badge>
                  <p className="text-xs text-text-muted">{row.reviewed_by}</p>
                  {row.review_note && <p className="text-xs text-text-muted">{row.review_note}</p>}
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setProblem('');
                    setReviewing(row);
                  }}
                >
                  Mark reviewed<span className="sr-only"> {formatDay(row.date)}</span>
                </Button>
              ),
          },
        ]}
      />
      <Modal
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Mark this close as reviewed"
        description={reviewing ? formatDay(reviewing.date) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button loading={review.isPending} onClick={() => review.mutate()}>
              Mark reviewed
            </Button>
          </>
        }
      >
        <Card variant="dense" className="mb-md">
          <p className="text-sm text-text-muted">
            The counts stay as the receptionist signed them. Your review is recorded in the audit
            log.
          </p>
        </Card>
        <Textarea
          label={
            reviewing && Number(reviewing.difference) !== 0
              ? 'Note (required: there is a cash difference)'
              : 'Note (optional)'
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {problem && (
          <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </Modal>
    </div>
  );
}
