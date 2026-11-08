import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCallbacks, markCallbackDone } from '../../api/air';
import { errorDetail } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { Button, Card, useToast } from '../ui';

/**
 * Receptionist: customers who asked the chat to "talk to a person". Only the customer's name and
 * a fixed note are shown; the chat itself is never visible to staff.
 */
export function CallbackPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const notes = useQuery({
    queryKey: ['desk-callbacks'],
    queryFn: listCallbacks,
    refetchInterval: 60_000,
  });
  const done = useMutation({
    mutationFn: (id: string) => markCallbackDone(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['desk-callbacks'] }),
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not update',
        description: errorDetail(error) ?? 'Please try again.',
      }),
  });

  const rows = notes.data ?? [];
  if (notes.isPending || notes.isError || rows.length === 0) return null;
  return (
    <Card as="section" aria-label="Callback requests">
      <h2 className="text-base font-semibold text-text">Callback requests ({rows.length})</h2>
      <ul className="mt-sm divide-y divide-border">
        {rows.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-sm py-sm">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-text">{n.customer_name}</p>
              <p className="break-words text-sm text-text-muted">{n.note}</p>
              <p className="text-xs text-text-muted">{formatDateTime(n.created_at)}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              loading={done.isPending && done.variables === n.id}
              onClick={() => done.mutate(n.id)}
            >
              Called back
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
