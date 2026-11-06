import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  cancelOwnVisit,
  getMoveSlots,
  moveOwnVisit,
  stylistChangeReasons,
  type StylistChangeReason,
} from '../../api/stylist';
import { formatTime } from '../../lib/format';
import { Button, Input, Modal, Select, useToast } from '../ui';

function ReasonField({
  value,
  onChange,
  error,
}: {
  value: StylistChangeReason | '';
  onChange: (value: StylistChangeReason | '') => void;
  error?: string;
}) {
  return (
    <Select
      label="Why is this changing?"
      hint="The customer gets a sorry note with this reason."
      required
      placeholder="Choose a reason"
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value as StylistChangeReason | '')}
      options={stylistChangeReasons.map((r) => ({ value: r.value, label: r.label }))}
    />
  );
}

/** Cancel one of my own scheduled visits. The customer is told, politely, with a reason. */
export function CancelVisitModal({
  id,
  customer,
  onClose,
}: {
  id: string;
  customer: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<StylistChangeReason | ''>('');
  const [problem, setProblem] = useState('');
  const cancel = useMutation({
    mutationFn: () => cancelOwnVisit(id, reason as StylistChangeReason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stylist'] });
      toast.show({
        tone: 'success',
        title: 'Visit cancelled',
        description: `${customer} was sent a sorry note.`,
      });
      onClose();
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not cancel. Please try again.')),
  });
  return (
    <Modal
      busy={cancel.isPending}
      open
      onClose={onClose}
      title="Cancel this visit?"
      description={`${customer} will be told, and any payment follows the salon's usual refund rules.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep visit
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => (reason ? cancel.mutate() : setProblem('Choose a reason first.'))}
          >
            Cancel visit
          </Button>
        </>
      }
    >
      <ReasonField value={reason} onChange={setReason} error={problem} />
    </Modal>
  );
}

/** Move one of my own scheduled visits to another free time (still with me). */
export function MoveVisitModal({
  id,
  customer,
  onClose,
}: {
  id: string;
  customer: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [reason, setReason] = useState<StylistChangeReason | ''>('');
  const [problem, setProblem] = useState('');
  const slots = useQuery({
    queryKey: ['stylist', 'move-slots', id, day],
    queryFn: () => getMoveSlots(id, day),
    enabled: !!day,
  });
  const move = useMutation({
    mutationFn: () => moveOwnVisit(id, start, reason as StylistChangeReason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stylist'] });
      toast.show({
        tone: 'success',
        title: 'Visit moved',
        description: `${customer} was sent a sorry note with the new time.`,
      });
      onClose();
    },
    onError: (error) => setProblem(genericErrorMessage(error, 'Could not move. Please try again.')),
  });
  const submit = () => {
    setProblem('');
    if (!start) return setProblem('Choose a new time.');
    if (!reason) return setProblem('Choose a reason first.');
    move.mutate();
  };
  return (
    <Modal
      busy={move.isPending}
      open
      onClose={onClose}
      title="Move this visit"
      description={`${customer} will be told, and can accept the new time or choose another.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={move.isPending} onClick={submit}>
            Move visit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <Input
          label="New day"
          type="date"
          value={day}
          onChange={(event) => {
            setDay(event.target.value);
            setStart('');
          }}
        />
        {day &&
          (slots.isPending ? (
            <p className="text-sm text-text-muted">Looking for free times…</p>
          ) : slots.isError ? (
            <p className="text-sm text-danger-text">We couldn&apos;t load the free times.</p>
          ) : slots.data.length === 0 ? (
            <p className="text-sm text-text-muted">No free times that day. Try another day.</p>
          ) : (
            <div role="group" aria-label="Free times" className="flex flex-wrap gap-sm">
              {slots.data.map((slot) => (
                <Button
                  key={slot}
                  size="sm"
                  variant={slot === start ? 'primary' : 'secondary'}
                  aria-pressed={slot === start}
                  onClick={() => setStart(slot)}
                >
                  {formatTime(slot)}
                </Button>
              ))}
            </div>
          ))}
        <ReasonField value={reason} onChange={setReason} error={problem} />
      </div>
    </Modal>
  );
}
