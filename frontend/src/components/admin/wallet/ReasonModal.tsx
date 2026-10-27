import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal, Select, Textarea } from '../../ui';

/** Asks for a reason (and optionally how the money goes back) before a sensitive action. */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  withMethod = false,
  busy = false,
  problem = '',
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  withMethod?: boolean;
  busy?: boolean;
  problem?: string;
  onClose: () => void;
  onConfirm: (reason: string, method: 'cash' | 'card' | 'upi') => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) return setError('Write a short reason (at least 3 letters).');
    setError('');
    onConfirm(reason.trim(), method);
  };
  return (
    <Modal open onClose={onClose} title={title} description={description}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        {children}
        {withMethod && (
          <Select
            label="Money goes back by"
            value={method}
            onChange={(e) => setMethod(e.target.value as 'cash' | 'card' | 'upi')}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'upi', label: 'UPI' },
            ]}
          />
        )}
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {(error || problem) && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {error || problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
