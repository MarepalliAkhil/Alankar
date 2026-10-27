import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  cancelMyRequest,
  createMyRequest,
  downloadMyData,
  listMyRequests,
  type MyDataRequest,
} from '../../api/privacy';
import { errorDetail } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { saveBlob } from '../../lib/saveBlob';
import { Badge, Button, Card, Modal, useToast, type BadgeTone } from '../ui';

const LABEL = { export: 'Download my data', delete: 'Delete my account' } as const;
const STATUS: Record<MyDataRequest['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for the salon', tone: 'warning' },
  completed: { label: 'Done', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Profile: ask for a copy of your data or for your account to be deleted. */
export function YourDataCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const requests = useQuery({ queryKey: ['my-data-requests'], queryFn: listMyRequests });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['my-data-requests'] });
  const fail = (title: string) => (error: unknown) =>
    toast.show({ tone: 'danger', title, description: errorDetail(error) ?? 'Please try again.' });

  const create = useMutation({
    mutationFn: (kind: 'export' | 'delete') => createMyRequest(kind),
    onSuccess: (r) => {
      refresh();
      setConfirming(false);
      toast.show({ tone: 'success', title: `Request sent: ${LABEL[r.kind]}` });
    },
    onError: fail('Could not send the request'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyRequest(id),
    onSuccess: refresh,
    onError: fail('Could not cancel'),
  });
  const download = useMutation({
    mutationFn: async (id: string) => saveBlob(await downloadMyData(id), 'my-data.json'),
    onError: fail('Download failed'),
  });

  const list = requests.data ?? [];
  const waiting = (kind: MyDataRequest['kind']) =>
    list.some((r) => r.kind === kind && r.status === 'pending');

  return (
    <Card as="section" aria-label="Your data" className="lg:col-span-2">
      <h2 className="text-lg font-semibold text-text">Your data</h2>
      <p className="mt-1 text-sm text-text-muted">
        You can ask for a copy of what we hold about you, or ask us to delete your account. The
        salon reviews each request. Deleting removes your name, contact details, notes and chats;
        past invoices stay, without your name.
      </p>
      <div className="mt-md flex flex-wrap gap-sm">
        <Button
          type="button"
          variant="secondary"
          disabled={waiting('export')}
          loading={create.isPending && create.variables === 'export'}
          onClick={() => create.mutate('export')}
        >
          Request my data
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={waiting('delete')}
          onClick={() => setConfirming(true)}
        >
          Request account deletion
        </Button>
      </div>
      {list.length > 0 && (
        <ul className="mt-md flex flex-col gap-sm" aria-label="Your requests">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm text-sm">
              <span>
                <span className="font-medium text-text">{LABEL[r.kind]}</span>
                <span className="ml-sm text-text-muted">{formatDateTime(r.created_at)}</span>
                {r.decision_note && (
                  <span className="block text-text-muted">{r.decision_note}</span>
                )}
              </span>
              <span className="flex items-center gap-sm">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                {r.status === 'pending' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => cancel.mutate(r.id)}
                  >
                    Cancel request
                  </Button>
                )}
                {r.can_download && (
                  <Button type="button" size="sm" onClick={() => download.mutate(r.id)}>
                    Download my data
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        description="If the salon approves, you will be signed out and cannot sign in again. You need to have no open bookings."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
            <Button
              type="button"
              loading={create.isPending}
              onClick={() => create.mutate('delete')}
            >
              Send deletion request
            </Button>
          </>
        }
      />
    </Card>
  );
}
