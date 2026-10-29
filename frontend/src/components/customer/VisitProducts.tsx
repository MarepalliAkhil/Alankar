import { useMutation, useQueryClient } from '@tanstack/react-query';
import { genericErrorMessage } from '../../api/auth-messages';
import type { CustomerAppointment } from '../../api/booking';
import { removeVisitProduct } from '../../api/shop';
import { formatINRExact } from '../../lib/format';
import { Badge, Button, useToast } from '../ui';

const CHANGEABLE = ['requested', 'awaiting_payment', 'scheduled'];

/** Products on a visit (Task 8.5 part 4): booked with it (paid online) or added later (paid at
 * the salon). A pay-at-the-salon product can be taken off before the visit. */
export function VisitProducts({ appt }: { appt: CustomerAppointment }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (row: string) => removeVisitProduct(appt.id, row),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Product removed from your visit' });
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
    },
    onError: (error: unknown) =>
      toast.show({
        tone: 'danger',
        title: "Couldn't remove it",
        description: genericErrorMessage(error, 'Please try again.'),
      }),
  });
  const rows = appt.products ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-xs font-medium text-text-muted">Products for this visit</p>
      <ul className="flex flex-col gap-xs text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-xs">
            <span className="text-text">
              {r.name} × {r.quantity} · {formatINRExact(r.amount)}
            </span>
            <span className="flex items-center gap-xs">
              <Badge tone={r.paid_online ? 'success' : 'info'}>
                {r.paid_online ? 'With the booking' : 'Pay at the salon'}
              </Badge>
              {!r.paid_online && r.status === 'held' && CHANGEABLE.includes(appt.status) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(r.id)}
                >
                  Remove
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
