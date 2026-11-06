import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { cancelAppointment, type ChangeReason, type DeskAppointment } from '../../api/desk';
import { Button, Modal, Textarea, useToast } from '../ui';
import { ReasonSelect } from './ReasonSelect';

/**
 * Cancel a booking on behalf of the salon. A reason category is required: the customer gets a
 * sorry note (in-app, email and text) that names it. The optional note stays inside the salon.
 */
export function CancelModal({
  appt,
  onClose,
  onDone,
}: {
  appt: DeskAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<ChangeReason | ''>('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appt.id, reason as ChangeReason, note.trim()),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Booking cancelled',
        description: 'The customer got a sorry note. Any online payment waits for admin approval.',
      });
      onDone();
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not cancel. Please try again.')),
  });
  const submit = () => {
    if (!reason) {
      setProblem('Choose a reason first.');
      return;
    }
    setProblem('');
    cancel.mutate();
  };
  return (
    <Modal
      busy={cancel.isPending}
      open
      onClose={onClose}
      title="Cancel this booking?"
      description={`${appt.service_name} for ${appt.customer_name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={submit}>
            Cancel booking
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <ReasonSelect value={reason} onChange={setReason} error={problem} />
        <Textarea
          label="Note for the team (optional)"
          hint="The customer does not see this."
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}
