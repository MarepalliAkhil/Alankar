import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import {
  forceAirCover,
  getAirCover,
  getAirDeskStatus,
  getAirSettings,
  getAirUsage,
  updateAirSettings,
  type AirSettings,
} from '../../api/airDesk';
import { errorDetail } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorState,
  Input,
  LoadingState,
  Select,
  useToast,
} from '../../components/ui';
import { formatDateTime, formatINR } from '../../lib/format';

type NumberKey =
  | 'daily_request_cap'
  | 'monthly_request_cap'
  | 'stylist_timeout_minutes'
  | 'payment_link_minutes'
  | 'max_order_quantity'
  | 'presence_minutes'
  | 'undo_window_minutes';

const NUMBERS: { key: NumberKey; label: string; hint: string }[] = [
  {
    key: 'presence_minutes',
    label: 'Receptionist counts as present for (minutes)',
    hint: 'Active at the desk within this time. Default 10.',
  },
  { key: 'stylist_timeout_minutes', label: 'Stylist timeout (minutes)', hint: 'Default 15.' },
  { key: 'payment_link_minutes', label: 'Payment-link expiry (minutes)', hint: 'Default 45.' },
  { key: 'max_order_quantity', label: 'Most of one product per chat order', hint: 'Default 5.' },
  { key: 'undo_window_minutes', label: 'Undo window (minutes)', hint: 'How long Undo is offered.' },
  { key: 'daily_request_cap', label: 'AI service calls per day (cap)', hint: '0 stops all calls.' },
  {
    key: 'monthly_request_cap',
    label: 'AI service calls per month (cap)',
    hint: '0 stops all calls.',
  },
];

/**
 * Admin only: AIR's switches and limits (every change is written to the audit log by the
 * server), usage and estimated cost, the cover override with a reason, and whether an AI key is
 * configured (the key itself is never shown or sent to the browser).
 */
export default function AirSettingsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['air-settings'], queryFn: getAirSettings });
  const usage = useQuery({ queryKey: ['air-usage'], queryFn: getAirUsage });
  const cover = useQuery({ queryKey: ['air-cover'], queryFn: getAirCover });
  const deskStatus = useQuery({
    queryKey: ['air-desk-status'],
    queryFn: getAirDeskStatus,
    refetchInterval: 30_000,
  });
  const [draft, setDraft] = useState<Partial<AirSettings>>({});
  const [mode, setMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  useEffect(() => {
    if (cover.data) setMode(cover.data.force);
  }, [cover.data]);

  const fail = (title: string) => (error: unknown) =>
    toast.show({ tone: 'danger', title, description: errorDetail(error) ?? 'Please try again.' });
  const save = useMutation({
    mutationFn: (changes: Partial<AirSettings>) => updateAirSettings(changes),
    onSuccess: (data) => {
      queryClient.setQueryData(['air-settings'], data);
      void queryClient.invalidateQueries({ queryKey: ['air-usage'] });
      void queryClient.invalidateQueries({ queryKey: ['air-cover'] });
      void queryClient.invalidateQueries({ queryKey: ['air-desk-status'] });
      toast.show({ tone: 'success', title: 'AIR settings saved (recorded in the audit log)' });
    },
    onError: fail('Could not save'),
  });
  const force = useMutation({
    mutationFn: () => forceAirCover(mode, reason.trim()),
    onSuccess: (data) => {
      queryClient.setQueryData(['air-cover'], data);
      setReason('');
      toast.show({ tone: 'success', title: 'Cover mode changed (recorded in the audit log)' });
    },
    onError: fail('Could not change cover mode'),
  });

  if (settings.isPending) return <LoadingState label="Loading AIR settings…" lines={4} />;
  if (settings.isError || !settings.data) {
    return (
      <ErrorState
        description="We couldn't load AIR settings."
        onRetry={() => void settings.refetch()}
      />
    );
  }
  const current = settings.data;
  const changed = (Object.keys(draft) as (keyof AirSettings)[]).filter(
    (key) =>
      [
        'master_enabled',
        'air_enabled',
        'monthly_spend_cap_rupees',
        ...NUMBERS.map((n) => n.key),
      ].includes(key) && String(draft[key]) !== String(current[key]),
  );
  const onSave = (event: FormEvent) => {
    event.preventDefault();
    const changes: Record<string, unknown> = {};
    for (const key of changed) {
      const value = draft[key];
      changes[key] = typeof current[key] === 'number' ? Number(value) : value;
    }
    save.mutate(changes as Partial<AirSettings>);
  };
  const u = usage.data;
  const c = cover.data;

  const st = deskStatus.data;

  return (
    <div className="grid min-w-0 gap-md xl:grid-cols-2">
      {!current.air_enabled && (
        <div
          role="alert"
          className="rounded-card border border-border border-l-4 border-l-danger bg-danger-soft p-md text-sm font-semibold text-danger-text xl:col-span-2"
        >
          AIR desk cover is OFF, AIR will not act. Booking requests wait for a person until it is
          switched on below.
        </div>
      )}
      <Card as="section" variant="dense" aria-label="AIR switches and limits">
        <form onSubmit={onSave} className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold text-text">Switches and limits</h2>
          <p className="text-sm text-text-muted">
            AI key configured:{' '}
            <Badge tone={current.key_configured ? 'success' : 'neutral'}>
              {current.key_configured ? 'yes' : 'no'}
            </Badge>
            {current.key_configured && current.provider ? ` (${current.provider})` : ''}. The key is
            set on the server only and is never shown here.
          </p>
          <Checkbox
            label="AIR desk cover enabled (AIR answers for the front desk when no receptionist is on shift or signed in; rule-based, needs no AI service)"
            checked={!!draft.air_enabled}
            onChange={(e) => setDraft((d) => ({ ...d, air_enabled: e.target.checked }))}
          />
          <Checkbox
            label="Optional AI service (master switch; customers must also agree in their chat)"
            checked={!!draft.master_enabled}
            onChange={(e) => setDraft((d) => ({ ...d, master_enabled: e.target.checked }))}
          />
          <div className="grid gap-md sm:grid-cols-2">
            {NUMBERS.map((n) => (
              <Input
                key={n.key}
                label={n.label}
                hint={n.hint}
                type="number"
                inputMode="numeric"
                min={0}
                value={String(draft[n.key] ?? '')}
                onChange={(e) => setDraft((d) => ({ ...d, [n.key]: e.target.value }))}
              />
            ))}
            <Input
              label="Monthly spending cap (Rs.)"
              hint="AI calls stop when the estimate reaches it."
              inputMode="decimal"
              value={String(draft.monthly_spend_cap_rupees ?? '')}
              onChange={(e) =>
                setDraft((d) => ({ ...d, monthly_spend_cap_rupees: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-sm">
            <Button type="submit" loading={save.isPending} disabled={changed.length === 0}>
              Save {changed.length > 0 ? `(${changed.length})` : ''}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={changed.length === 0}
              onClick={() => setDraft(current)}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex min-w-0 flex-col gap-md">
        <Card
          variant="dense"
          as="section"
          aria-label="Desk cover status"
          className="flex flex-col gap-sm"
        >
          <h2 className="text-lg font-semibold text-text">Desk cover status</h2>
          {deskStatus.isPending ? (
            <LoadingState label="Loading status…" lines={3} />
          ) : !st ? (
            <p className="text-sm text-text-muted">The status is not available right now.</p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-1 text-sm text-text">
                <dt className="text-text-muted">Desk cover enabled</dt>
                <dd>
                  <Badge tone={st.cover_enabled ? 'success' : 'danger'}>
                    {st.cover_enabled ? 'yes' : 'no'}
                  </Badge>
                </dd>
                <dt className="text-text-muted">Covering the desk now</dt>
                <dd>
                  <Badge tone={st.cover_active ? 'success' : 'neutral'}>
                    {st.cover_active ? 'yes' : 'no'}
                  </Badge>{' '}
                  because {st.cover_reason_text}
                </dd>
                <dt className="text-text-muted">Last sweep</dt>
                <dd>{st.last_sweep_at ? formatDateTime(st.last_sweep_at) : 'never'}</dd>
                <dt className="text-text-muted">Last error</dt>
                <dd>{st.last_error || 'none'}</dd>
                <dt className="text-text-muted">Waiting, AIR could not handle</dt>
                <dd>{st.waiting_count}</dd>
              </dl>
              {st.scheduler_stale && (
                <p role="status" className="text-sm font-medium text-danger-text">
                  The scheduler has not run for more than 5 minutes
                  {st.last_sweep_at ? '' : ' (it has never run)'}. Requests still move when someone
                  opens the requests list, but run <code>python manage.py air_cover_sweep</code>{' '}
                  every minute.
                </p>
              )}
              {st.waiting.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-text-muted">
                  {st.waiting.map((w) => (
                    <li key={w.id}>
                      Request {w.id.slice(0, 8)}: {w.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card
          variant="dense"
          as="section"
          aria-label="Usage and estimated cost"
          className="flex flex-col gap-sm"
        >
          <h2 className="text-lg font-semibold text-text">Usage and estimated cost</h2>
          {usage.isPending ? (
            <LoadingState label="Loading usage…" lines={2} />
          ) : !u ? (
            <p className="text-sm text-text-muted">Usage is not available.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-1 text-sm text-text">
              <dt className="text-text-muted">Today</dt>
              <dd>
                {u.today_requests} of {u.daily_request_cap} calls, about{' '}
                {formatINR(u.today_cost_rupees)}
              </dd>
              <dt className="text-text-muted">This month</dt>
              <dd>
                {u.month_requests} of {u.monthly_request_cap} calls, about{' '}
                {formatINR(u.month_cost_rupees)} of {formatINR(u.monthly_spend_cap_rupees)}
              </dd>
              <dt className="text-text-muted">AI service now</dt>
              <dd>
                {u.ai_available
                  ? 'available'
                  : `not used (${u.ai_blocked_reason || 'switched off'})`}
                {u.breaker_open ? ' · paused after repeated failures' : ''}
              </dd>
            </dl>
          )}
          <p className="text-xs text-text-muted">
            Costs are estimates: calls times the cost per call set by the admin, not a bill.
          </p>
        </Card>

        <Card as="section" variant="dense" aria-label="Cover override">
          <form
            className="flex flex-col gap-sm"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              force.mutate();
            }}
          >
            <h2 className="text-lg font-semibold text-text">Cover override</h2>
            <p className="text-sm text-text-muted">
              {c
                ? `AIR is ${c.active ? 'covering the desk now' : 'not covering the desk now'} (${c.force === 'auto' ? 'automatic' : `forced ${c.force}`}). Receptionist on shift: ${c.receptionist_on_shift ? 'yes' : 'no'}; signed in: ${c.receptionist_logged_in ? 'yes' : 'no'}.`
                : 'Loading…'}
            </p>
            <Select
              label="Mode"
              options={[
                { value: 'auto', label: 'Automatic (no receptionist on shift or signed in)' },
                { value: 'on', label: 'Force on' },
                { value: 'off', label: 'Force off' },
              ]}
              value={mode}
              onChange={(e) => setMode(e.target.value as 'auto' | 'on' | 'off')}
            />
            <Input
              label="Reason (required to force)"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
            <div>
              <Button
                type="submit"
                loading={force.isPending}
                disabled={mode !== 'auto' && reason.trim().length < 3}
              >
                Apply
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
