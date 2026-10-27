import { cn } from '../../lib/cn';
import { appointmentStatusLabels, type AppointmentStatus } from '../../types/appointment';
import { statusClasses } from './status-styles';

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
