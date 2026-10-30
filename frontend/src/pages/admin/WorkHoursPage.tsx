import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import {
  correctSession,
  getReceptionist,
  listReceptionists,
  saveShifts,
  type AdminSession,
  type ReceptionistDetail,
  type ReceptionistSummary,
  type ShiftDay,
} from '../../api/workAdmin';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Table,
  Textarea,
  useToast,
  type BadgeTone,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact, isoToShopLocal, shopLocalToIso } from '../../lib/format';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

const FLAG_TONE: Record<string, BadgeTone> = {
  long: 'danger',
  overlap: 'danger',
  idle: 'warning',
  stale: 'warning',
};
const STATE_TONE: Record<string, BadgeTone> = {
  on_time: 'success',
  late: 'warning',
  missed: 'danger',
};
const STATE_LABEL: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  missed: 'Missed',
};

function punctualityText(p: ReceptionistSummary['punctuality']): string {
  if (!p.has_shifts) return 'No shift set';
  if (!p.shifts_counted) return 'No shifts counted yet this month';
  return `On time ${p.on_time} of ${p.shifts_counted} shifts (${p.on_time_rate}%), late ${p.late}, missed ${p.missed}`;
}

/** Admin: receptionists' hours, sessions that look wrong, corrections, shifts and monthly pay. */
export default function WorkHoursPage() {
  useDocumentTitle('Work Hours');
  const [month, setMonth] = useState(thisMonth());
  const [open, setOpen] = useState('');
  const list = useQuery({ queryKey: ['a-work', month], queryFn: () => listReceptionists(month) });
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Work Hours"
        description="Receptionist hours come from sign-in to sign-out; a receptionist who goes idle is signed out and the idle time is not counted. Correct a wrong session with a reason: it is recorded, and the receptionist sees “Corrected by admin”."
      />
      <div className="max-w-xs">
        <Input
          label="Month"
          type="month"
          max={thisMonth()}
          value={month}
          onChange={(e) => {
            if (e.target.value) {
              setMonth(e.target.value);
              setOpen('');
            }
          }}
        />
      </div>
      {list.isPending ? (
        <LoadingState label="Loading work hours…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load work hours."
          onRetry={() => void list.refetch()}
        />
      ) : list.data.receptionists.length === 0 ? (
        <EmptyState
          title="No receptionists yet"
          description="Invite a receptionist from Staff. Their sessions appear here."
        />
      ) : (
        <>
          <p className="text-sm text-text-muted" role="status">
            Team total this month: {list.data.totals.hours} hours,{' '}
            {formatINRExact(list.data.totals.pay)} estimated pay. On time means within{' '}
            {list.data.grace_minutes} minutes of the shift start (change in Settings). Sessions over{' '}
            {list.data.long_hours} hours are flagged.
          </p>
          <ul className="grid gap-md md:grid-cols-2" aria-label="Receptionists">
            {list.data.receptionists.map((r) => (
              <li key={r.id}>
                <Card variant="dense" className="flex flex-col gap-xs">
                  <div className="flex flex-wrap items-center gap-xs">
                    <h2 className="text-lg font-semibold text-text">{r.name}</h2>
                    {!r.active && <Badge>Deactivated</Badge>}
                    {r.flagged_sessions > 0 && (
                      <Badge tone="warning">
                        {r.flagged_sessions} session{r.flagged_sessions === 1 ? '' : 's'} to check
                      </Badge>
                    )}
                    {r.pay.corrected_sessions > 0 && (
                      <Badge tone="info">{r.pay.corrected_sessions} corrected</Badge>
                    )}
                  </div>
                  <p className="text-xl font-semibold text-text">
                    {r.pay.hours} hours
                    <span className="text-sm font-normal text-text-muted">
                      {' '}
                      · {r.pay.pay === null ? 'No hourly rate set' : formatINRExact(r.pay.pay)}
                    </span>
                  </p>
                  <p className="text-sm text-text-muted">{punctualityText(r.punctuality)}</p>
                  <div className="pt-xs">
                    <Button
                      size="sm"
                      variant={open === r.id ? 'secondary' : 'primary'}
                      aria-expanded={open === r.id}
                      onClick={() => setOpen(open === r.id ? '' : r.id)}
                    >
                      {open === r.id ? 'Hide details' : `Sessions for ${r.name}`}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {open && <Details id={open} month={month} />}
    </div>
  );
}

function Details({ id, month }: { id: string; month: string }) {
  const detail = useQuery({
    queryKey: ['a-work', month, id],
    queryFn: () => getReceptionist(id, month),
  });
  if (detail.isPending) return <LoadingState label="Loading sessions…" />;
  if (detail.isError) {
    return (
      <ErrorState
        description="We couldn't load this receptionist."
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return <DetailsBody d={detail.data} month={month} />;
}

function DetailsBody({ d, month }: { d: ReceptionistDetail; month: string }) {
  const [fixing, setFixing] = useState<AdminSession | null>(null);
  const columns: Column<AdminSession>[] = [
    { key: 'start', header: 'Signed in', render: (s) => formatDateTime(s.started_at) },
    {
      key: 'end',
      header: 'Signed out',
      render: (s) => (s.ended_at ? formatDateTime(s.ended_at) : 'Still signed in'),
    },
    { key: 'hours', header: 'Hours', render: (s) => s.hours },
    {
      key: 'how',
      header: 'Ended',
      render: (s) => s.end_reason_label || (s.open ? '—' : ''),
    },
    {
      key: 'flags',
      header: 'Check',
      render: (s) => (
        <span className="flex flex-wrap gap-xs">
          {s.flags.length === 0 && <span className="text-text-muted">OK</span>}
          {s.flags.map((f) => (
            <Badge key={f.code} tone={FLAG_TONE[f.code] ?? 'neutral'}>
              {f.label}
            </Badge>
          ))}
          {s.corrected && (
            <Badge tone="info">
              Corrected by {s.corrected_by || 'admin'}: {s.correction_reason}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'act',
      header: 'Action',
      render: (s) => (
        <Button
          size="sm"
          variant="secondary"
          disabled={s.open}
          aria-label={`Correct session of ${formatDateTime(s.started_at)}`}
          onClick={() => setFixing(s)}
        >
          Correct
        </Button>
      ),
    },
  ];
  return (
    <Card as="section" aria-label={`Work details for ${d.name}`} className="flex flex-col gap-md">
      <h2 className="text-lg font-semibold text-text">{d.name}</h2>
      <div className="grid gap-md sm:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-text-muted">Hours</h3>
          <p className="text-xl font-semibold text-text">{d.pay.hours}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-muted">Hourly rate</h3>
          <p className="text-xl font-semibold text-text">
            {d.pay.hourly_rate === null ? 'Not set' : formatINRExact(d.pay.hourly_rate)}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-muted">Pay for the month</h3>
          <p className="text-xl font-semibold text-text">
            {d.pay.pay === null ? 'Not set' : formatINRExact(d.pay.pay)}
          </p>
          <p className="text-xs text-text-muted">
            Hours × rate, corrections applied
            {d.pay.corrected_sessions > 0 ? ` (${d.pay.corrected_sessions} corrected)` : ''}.
          </p>
        </div>
      </div>
      <Table
        caption={`Sessions of ${d.name}`}
        columns={columns}
        rows={d.sessions}
        rowKey={(s) => s.id}
        emptyMessage="No sessions this month."
      />
      <Punctuality d={d} />
      <ShiftEditor id={d.id} name={d.name} initial={d.shifts} month={month} />
      {fixing && (
        <CorrectModal session={fixing} id={d.id} month={month} onClose={() => setFixing(null)} />
      )}
    </Card>
  );
}

function Punctuality({ d }: { d: ReceptionistDetail }) {
  return (
    <div className="flex flex-col gap-xs">
      <h3 className="text-sm font-semibold text-text">Punctuality</h3>
      <p className="text-sm text-text-muted">{punctualityText(d.punctuality)}</p>
      {d.punctuality.has_shifts && d.punctuality.days.length > 0 && (
        <ul className="text-sm text-text">
          {d.punctuality.days.map((day) => (
            <li key={day.date} className="flex flex-wrap items-center gap-xs">
              <span>
                {day.date} ({day.shift})
              </span>
              <Badge tone={STATE_TONE[day.state]}>{STATE_LABEL[day.state]}</Badge>
              {day.state === 'late' && (
                <span className="text-text-muted">{day.minutes_late} minutes after the start</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CorrectModal({
  session,
  id,
  month,
  onClose,
}: {
  session: AdminSession;
  id: string;
  month: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [start, setStart] = useState(isoToShopLocal(session.started_at));
  const [end, setEnd] = useState(session.ended_at ? isoToShopLocal(session.ended_at) : '');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () =>
      correctSession(session.id, {
        started_at: shopLocalToIso(start),
        ended_at: shopLocalToIso(end),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['a-work', month] });
      void queryClient.invalidateQueries({ queryKey: ['a-work', month, id] });
      toast.show({ tone: 'success', title: 'Session corrected. It is in the audit log.' });
      onClose();
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not correct the session.'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!start || !end) return setProblem('Enter both times.');
    if (reason.trim().length < 3) return setProblem('Write a short reason (at least 3 letters).');
    setProblem('');
    save.mutate();
  };
  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title="Correct a work session"
      description="Change the sign-in and sign-out times. The receptionist sees “Corrected by admin” with your reason, and the old times are kept in the audit log."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Input
          label="Signed in"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Input
          label="Signed out"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} type="submit" disabled={save.isPending}>
            Save correction
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ShiftEditor({
  id,
  name,
  initial,
  month,
}: {
  id: string;
  name: string;
  initial: ShiftDay[];
  month: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<ShiftDay[]>(initial);
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () => saveShifts(id, days),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['a-work', month] });
      void queryClient.invalidateQueries({ queryKey: ['a-work', month, id] });
      toast.show({ tone: 'success', title: 'Shifts saved' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not save the shifts.'),
  });
  const set = (index: number, next: ShiftDay) =>
    setDays((all) => all.map((d, i) => (i === index ? next : d)));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const bad = days.findIndex((d) => d !== null && d.start >= d.end);
    if (bad >= 0) return setProblem(`${DAYS[bad]}: the shift must end after it starts.`);
    setProblem('');
    save.mutate();
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-sm"
      aria-label={`Weekly shifts for ${name}`}
    >
      <h3 className="text-sm font-semibold text-text">Weekly shifts</h3>
      <p className="text-xs text-text-muted">
        Used only to judge punctuality. A day without a shift is a day off.
      </p>
      <ul className="flex flex-col gap-xs">
        {DAYS.map((day, index) => {
          const shift = days[index];
          return (
            <li key={day} className="flex flex-wrap items-end gap-sm">
              <span className="w-28 text-sm text-text">{day}</span>
              {shift ? (
                <>
                  <Input
                    label={`${day} start`}
                    type="time"
                    value={shift.start}
                    onChange={(e) => set(index, { ...shift, start: e.target.value })}
                  />
                  <Input
                    label={`${day} end`}
                    type="time"
                    value={shift.end}
                    onChange={(e) => set(index, { ...shift, end: e.target.value })}
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => set(index, null)}>
                    Day off<span className="sr-only"> on {day}</span>
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => set(index, { start: '09:00', end: '17:00' })}
                >
                  Add shift<span className="sr-only"> on {day}</span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div>
        <Button loading={save.isPending} type="submit" disabled={save.isPending}>
          Save shifts
        </Button>
      </div>
    </form>
  );
}
