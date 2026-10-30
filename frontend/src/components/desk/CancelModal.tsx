import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { cancelAppointment, type DeskAppointment } from '../../api/desk';
import { Button, Modal, Textarea, useToast } from '../ui';

/** Cancel a booking on behalf of the salon. A reason is required and is emailed to the customer. */
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
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appt.id, reason.trim()),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Booking cancelled',
        description: 'The customer was emailed. Any online payment waits for admin approval.',
      });
      onDone();
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not cancel. Please try again.')),
  });
  const submit = () => {
    if (reason.trim().length < 3) {
      setProblem('Give a short reason. The customer will see it.');
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
      <Textarea
        label="Reason (sent to the customer)"
        required
        maxLength={300}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={problem}
      />
    </Modal>
  );
}
