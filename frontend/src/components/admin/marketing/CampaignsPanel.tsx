import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  listCoupons,
  runDueCampaigns,
  scheduleCampaign,
  sendCampaign,
  unscheduleCampaign,
  updateCampaign,
  type AudienceKind,
  type CampaignInput,
  type CampaignList,
  type CampaignRow,
} from '../../../api/marketing';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../ui';

/** Campaigns are simulated emails. They reach only customers who ticked the marketing box. */
export function CampaignsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['mk-campaigns'], queryFn: listCampaigns });
  const [editing, setEditing] = useState<CampaignRow | 'new' | null>(null);
  const [confirming, setConfirming] = useState<CampaignRow | null>(null);
  const [scheduling, setScheduling] = useState<CampaignRow | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['mk-campaigns'] });
  const remove = useMutation({
    mutationFn: (c: CampaignRow) => deleteCampaign(c.id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Draft deleted' });
    },
  });
  const unschedule = useMutation({
    mutationFn: (c: CampaignRow) => unscheduleCampaign(c.id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Back to a draft' });
    },
  });
  const runDue = useMutation({
    mutationFn: runDueCampaigns,
    onSuccess: (r) => {
      refresh();
      toast.show({
        tone: 'success',
        title: r.sent === 0 ? 'Nothing is due yet' : `${r.sent} campaign(s) sent`,
      });
    },
  });
  return (
    <Card variant="dense" as="section" aria-label="Campaigns">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Campaigns</h2>
          <p className="mt-1 text-sm text-text-muted">
            Messages are simulated in this version. Only customers who agreed to marketing receive
            them, and every message has an unsubscribe link.
            {list.data
              ? ` ${list.data.opted_in} customer${list.data.opted_in === 1 ? '' : 's'} can be reached now.`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button
            type="button"
            variant="secondary"
            loading={runDue.isPending}
            onClick={() => runDue.mutate()}
          >
            Send due now
          </Button>
          <Button type="button" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> New campaign
          </Button>
        </div>
      </div>
      <div className="mt-md">
        {list.isPending ? (
          <LoadingState label="Loading campaigns…" />
        ) : list.isError ? (
          <ErrorState
            description="We couldn't load the campaigns."
            onRetry={() => void list.refetch()}
          />
        ) : list.data.results.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Write a message, check who it reaches, then send it."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {list.data.results.map((c) => (
              <li key={c.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-medium text-text">{c.name}</p>
                  <Badge
                    tone={
                      c.status === 'sent'
                        ? 'success'
                        : c.status === 'scheduled'
                          ? 'info'
                          : 'warning'
                    }
                  >
                    {c.status === 'sent'
                      ? 'Sent'
                      : c.status === 'scheduled'
                        ? 'Scheduled'
                        : 'Draft'}
                  </Badge>
                  {c.coupon && <Badge tone="primary">Coupon {c.coupon}</Badge>}
                </div>
                <p className="mt-xs text-sm text-text">{c.subject}</p>
                <p className="mt-xs text-xs text-text-muted">
                  {c.audience_label} ·{' '}
                  {c.status === 'sent'
                    ? `sent to ${c.recipients} on ${c.sent_at ? new Date(c.sent_at).toLocaleDateString() : ''}`
                    : c.status === 'scheduled' && c.scheduled_for
                      ? `goes out ${new Date(c.scheduled_for).toLocaleString()} · would reach ${c.would_reach}`
                      : `would reach ${c.would_reach}`}
                </p>
                {c.status === 'scheduled' && (
                  <div className="mt-sm flex flex-wrap gap-sm">
                    <Button type="button" size="sm" onClick={() => setConfirming(c)}>
                      Send…
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={unschedule.isPending && unschedule.variables?.id === c.id}
                      onClick={() => unschedule.mutate(c)}
                    >
                      Remove schedule
                    </Button>
                  </div>
                )}
                {c.status === 'draft' && (
                  <div className="mt-sm flex flex-wrap gap-sm">
                    <Button type="button" size="sm" onClick={() => setConfirming(c)}>
                      Send…
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setScheduling(c)}
                    >
                      Schedule…
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      loading={remove.isPending && remove.variables?.id === c.id}
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => remove.mutate(c)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && list.data && (
        <CampaignForm
          campaign={editing === 'new' ? null : editing}
          audiences={list.data.audiences}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {scheduling && (
        <ScheduleDialog
          campaign={scheduling}
          onClose={() => setScheduling(null)}
          onDone={() => {
            setScheduling(null);
            refresh();
          }}
        />
      )}
      {confirming && (
        <SendDialog
          campaign={confirming}
          onClose={() => setConfirming(null)}
          onSent={() => {
            setConfirming(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function ScheduleDialog({
  campaign,
  onClose,
  onDone,
}: {
  campaign: CampaignRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [when, setWhen] = useState('');
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () => scheduleCampaign(campaign.id, new Date(when).toISOString()),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Campaign scheduled' });
      onDone();
    },
    onError: (error) =>
      setProblem(serverFieldErrors(error).send_at ?? errorDetail(error) ?? 'Could not schedule.'),
  });
  return (
    <Modal busy={save.isPending} open onClose={onClose} title="Schedule this campaign" size="sm">
      <form
        className="flex flex-col gap-md"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setProblem('');
          if (!when) {
            setProblem('Choose the day and time.');
            return;
          }
          save.mutate();
        }}
      >
        <p className="text-sm text-text">
          “{campaign.subject}” will be sent to the customers who agreed to marketing at that time.
          Until then it cannot be edited; you can remove the schedule at any moment.
        </p>
        <Input
          label="Send on"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Schedule
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SendDialog({
  campaign,
  onClose,
  onSent,
}: {
  campaign: CampaignRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [problem, setProblem] = useState('');
  const send = useMutation({
    mutationFn: () => sendCampaign(campaign.id),
    onSuccess: (c) => {
      toast.show({
        tone: 'success',
        title: `Sent to ${c.recipients} customer${c.recipients === 1 ? '' : 's'}`,
      });
      onSent();
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not send.'),
  });
  return (
    <Modal busy={send.isPending} open onClose={onClose} title="Send this campaign?" size="sm">
      <p className="text-sm text-text">
        “{campaign.subject}” will go to {campaign.would_reach ?? 0} opted-in customer
        {campaign.would_reach === 1 ? '' : 's'}. A sent campaign cannot be changed or sent again.
      </p>
      {problem && (
        <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div className="mt-md flex gap-sm">
        <Button type="button" onClick={() => send.mutate()} loading={send.isPending}>
          Send now
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function CampaignForm({
  campaign,
  audiences,
  onClose,
  onSaved,
}: {
  campaign: CampaignRow | null;
  audiences: CampaignList['audiences'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const coupons = useQuery({ queryKey: ['mk-coupons'], queryFn: listCoupons });
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    subject: campaign?.subject ?? '',
    body: campaign?.body ?? '',
    audience: (campaign?.audience ?? 'all') as AudienceKind,
    coupon: campaign?.coupon ?? '',
  });
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: CampaignInput) =>
      campaign ? updateCampaign(campaign.id, body) : createCampaign(body),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Draft saved' });
      onSaved();
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save.'),
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || form.body.trim().length < 10) {
      return setProblem('Give it a name, a subject and a message of at least 10 characters.');
    }
    save.mutate({ ...form, coupon: form.coupon || null });
  };
  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title={campaign ? 'Edit campaign' : 'New campaign'}
      size="lg"
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Input
          label="Name (only you see it)"
          value={form.name}
          maxLength={80}
          error={fields.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Email subject"
          value={form.subject}
          maxLength={120}
          error={fields.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
        />
        <Textarea
          label="Message"
          rows={6}
          value={form.body}
          error={fields.body}
          hint="An unsubscribe link is added for you."
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
        <div className="grid gap-md sm:grid-cols-2">
          <Select
            label="Who gets it"
            value={form.audience}
            onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as AudienceKind }))}
            options={audiences}
          />
          <Select
            label="Coupon to mention"
            value={form.coupon}
            onChange={(e) => setForm((f) => ({ ...f, coupon: e.target.value }))}
            placeholder="None"
            options={(coupons.data ?? [])
              .filter((c) => c.state === 'live')
              .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
          />
        </div>
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Save draft
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
