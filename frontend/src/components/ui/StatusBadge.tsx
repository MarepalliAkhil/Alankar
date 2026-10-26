import { cn } from '../../lib/cn';
import { appointmentStatusLabels, type AppointmentStatus } from '../../types/appointment';

// Static class strings so Tailwind can see every status colour.
const statusClasses: Record<AppointmentStatus, string> = {
  requested: 'bg-status-requested-bg text-status-requested-fg',
  awaiting_payment: 'bg-status-awaiting-payment-bg text-status-awaiting-payment-fg',
  scheduled: 'bg-status-scheduled-bg text-status-scheduled-fg',
  checked_in: 'bg-status-checked-in-bg text-status-checked-in-fg',
  in_progress: 'bg-status-in-progress-bg text-status-in-progress-fg',
  completed: 'bg-status-completed-bg text-status-completed-fg',
  rejected: 'bg-status-rejected-bg text-status-rejected-fg',
  payment_expired: 'bg-status-payment-expired-bg text-status-payment-expired-fg',
  cancelled: 'bg-status-cancelled-bg text-status-cancelled-fg',
  no_show: 'bg-status-no-show-bg text-status-no-show-fg',
};

export interface StatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
        statusClasses[status],
        className,
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {appointmentStatusLabels[status]}
    </span>
  );
}
