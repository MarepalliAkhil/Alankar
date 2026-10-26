export const appointmentStatuses = [
  'requested',
  'awaiting_payment',
  'scheduled',
  'checked_in',
  'in_progress',
  'completed',
  'rejected',
  'payment_expired',
  'cancelled',
  'no_show',
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  requested: 'Requested',
  awaiting_payment: 'Awaiting payment',
  scheduled: 'Scheduled',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
  payment_expired: 'Payment expired',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};
