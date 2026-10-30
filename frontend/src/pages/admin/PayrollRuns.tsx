import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  addAdjustment,
  approveRun,
  createRun,
  getItem,
  getRun,
  listRuns,
  payRun,
  refreshRun,
  voidAdjustment,
  type RunItem,
} from '../../api/payroll';
import { errorDetail } from '../../api/client';
import PayslipView from '../../components/PayslipView';
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
  Table,
  Textarea,
  useToast,
  type BadgeTone,
  type Column,
} from '../../components/ui';
import { formatDateTime, formatINRExact, monthName } from '../../lib/format';

const TONE: Record<string, BadgeTone> = { draft: 'warning', approved: 'info', paid: 'success' };

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

/** Admin: draft → review → adjust → approve (locks) → mark paid (simulated). */
export default function PayrollRuns() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [openId, setOpenId] = useState('');
  const [problem, setProblem] = useState('');
  const runs = useQuery({ queryKey: ['a-runs'], queryFn: listRuns });
  const create = useMutation({
    mutationFn: () => createRun(month),
    onSuccess: (run) => {
      setProblem('');
      void queryClient.invalidateQueries({ queryKey: ['a-runs'] });
      setOpenId(run.id);
      toast.show({ tone: 'success', title: `Draft payroll for ${monthName(run.month)} created.` });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not create the payroll run.'),
  });
  return (
    <div className="flex flex-col gap-lg">
      <Card className="flex flex-col gap-sm">
        <h2 className="text-lg font-semibold text-text">Start a payroll run</h2>
        <p className="text-sm text-text-muted">
          One run per month, covering every stylist and receptionist. A draft can be recalculated
          and adjusted. Once approved it is locked; later corrections are added as separate bonus or
          deduction lines.
        </p>
        <div className="flex flex-wrap items-end gap-sm">
          <div className="max-w-xs">
            <Input
              label="Month for the run"
              type="month"
              max={thisMonth()}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </div>
          <Button
            loading={create.isPending}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            Create draft run
          </Button>
        </div>
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </Card>
      {runs.isPending ? (
        <LoadingState label="Loading payroll runs…" />
      ) : runs.isError ? (
        <ErrorState
          description="We couldn't load payroll runs."
          onRetry={() => void runs.refetch()}
        />
      ) : runs.data.length === 0 ? (
        <EmptyState
          title="No payroll runs yet"
          description="Create a draft for a finished month to review every line before approving."
        />
      ) : (
        <ul className="grid gap-sm md:grid-cols-2" aria-label="Payroll runs">
          {runs.data.map((r) => (
            <li key={r.id}>
              <Card variant="dense" className="flex flex-col gap-xs">
                <div className="flex flex-wrap items-center gap-xs">
                  <h3 className="text-lg font-semibold text-text">{monthName(r.month)}</h3>
                  <Badge tone={TONE[r.status]}>{r.status_label}</Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {r.staff} staff · net {formatINRExact(r.net)}
                </p>
                <div>
                  <Button
                    size="sm"
                    variant={openId === r.id ? 'secondary' : 'primary'}
                    aria-expanded={openId === r.id}
                    onClick={() => setOpenId(openId === r.id ? '' : r.id)}
                  >
                    {openId === r.id ? 'Close run' : `Open run for ${monthName(r.month)}`}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {openId && <RunPanel id={openId} />}
    </div>
  );
}

function RunPanel({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [slipFor, setSlipFor] = useState<RunItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState('');
  const run = useQuery({ queryKey: ['a-run', id], queryFn: () => getRun(id) });
  const done = (message: string) => () => {
    setProblem('');
    void queryClient.invalidateQueries({ queryKey: ['a-run', id] });
    void queryClient.invalidateQueries({ queryKey: ['a-runs'] });
    toast.show({ tone: 'success', title: message });
  };
  const fail = (e: unknown) => setProblem(errorDetail(e) ?? 'That did not work. Try again.');
  const refresh = useMutation({
    mutationFn: () => refreshRun(id),
    onSuccess: done('Recalculated from the latest data.'),
    onError: fail,
  });
  const approve = useMutation({
    mutationFn: () => approveRun(id),
    onSuccess: () => {
      setConfirming(false);
      done('Run approved and locked.')();
    },
    onError: (e) => {
      setConfirming(false);
      fail(e);
    },
  });

  if (run.isPending) return <LoadingState label="Loading the run…" />;
  if (run.isError)
    return (
      <ErrorState description="We couldn't load that run." onRetry={() => void run.refetch()} />
    );
  const r = run.data;
  const columns: Column<RunItem>[] = [
    { key: 'name', header: 'Name', render: (i) => i.name },
    {
      key: 'role',
      header: 'Role',
      render: (i) => (i.role === 'stylist' ? 'Stylist' : 'Receptionist'),
    },
    { key: 'base', header: 'Base pay', render: (i) => formatINRExact(i.base_pay) },
    { key: 'tips', header: 'Tips', render: (i) => formatINRExact(i.tips) },
    {
      key: 'adj',
      header: 'Bonus / deduction',
      render: (i) => `${formatINRExact(i.adjustments_total)} (${i.adjustments})`,
    },
    { key: 'net', header: 'Net', render: (i) => formatINRExact(i.net) },
    {
      key: 'open',
      header: '',
      render: (i) => (
        <Button size="sm" variant="secondary" onClick={() => setSlipFor(i)}>
          Payslip for {i.name}
        </Button>
      ),
    },
  ];
  const c = r.checks;
  return (
    <section className="flex flex-col gap-md" aria-label={`Run ${monthName(r.month)}`}>
      <div className="flex flex-wrap items-center gap-sm">
        <h2 className="text-lg font-semibold text-text">Run for {monthName(r.month)}</h2>
        <Badge tone={TONE[r.status]}>{r.status_label}</Badge>
      </div>
      <p className="text-sm text-text-muted">
        {r.status === 'draft' &&
          'Draft: review each line, add a bonus or deduction with a reason, then approve.'}
        {r.status === 'approved' &&
          `Approved by ${r.approved_by} on ${r.approved_at ? formatDateTime(r.approved_at) : ''}. The lines are locked; corrections are new adjustment lines.`}
        {r.status === 'paid' &&
          `Paid on ${r.paid_at ? formatDateTime(r.paid_at) : ''} by ${r.paid_by}${r.payment_reference ? `, reference ${r.payment_reference}` : ''}. Nothing more can be changed in this run.`}
      </p>
      <Table
        caption={`Pay lines for ${monthName(r.month)}`}
        columns={columns}
        rows={r.items}
        rowKey={(i) => i.id}
        emptyMessage="No staff in this run."
      />
      <div className="grid gap-md sm:grid-cols-4">
        <Total label="Base pay" value={r.totals.base_pay} />
        <Total label="Tips" value={r.totals.tips} />
        <Total label="Bonuses and deductions" value={r.totals.adjustments} />
        <Total label="Net to pay" value={r.totals.net} />
      </div>
      <p className="text-sm text-text-muted" role="status">
        Check: tips on invoices {formatINRExact(c.tips_on_invoices)}, tips in this run{' '}
        {formatINRExact(c.tips_in_run)}. {c.invoices_in_month} invoice
        {c.invoices_in_month === 1 ? '' : 's'} this month, {c.visits_in_run} visit
        {c.visits_in_run === 1 ? '' : 's'} in pay
        {c.waiting_checkout > 0 ? `, ${c.waiting_checkout} still waiting for checkout` : ''}.
      </p>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        {r.status === 'draft' && (
          <>
            <Button
              loading={refresh.isPending}
              variant="secondary"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              Recalculate
            </Button>
            <Button onClick={() => setConfirming(true)}>Approve run</Button>
          </>
        )}
        {r.status === 'approved' && <Button onClick={() => setPaying(true)}>Mark as paid</Button>}
      </div>
      <p className="text-xs text-text-muted">
        Payment is simulated: marking a run as paid records it here and sends nothing to a bank.
      </p>
      {confirming && (
        <Modal
          busy={approve.isPending}
          open
          onClose={() => setConfirming(false)}
          title="Approve this payroll run?"
          description="Approving locks every line. You can still add bonus or deduction lines afterwards, each with a reason, but the pay itself cannot be recalculated."
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                loading={approve.isPending}
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                Yes, approve and lock
              </Button>
            </div>
          }
        />
      )}
      {paying && (
        <PayModal id={id} onClose={() => setPaying(false)} onDone={done('Marked as paid.')} />
      )}
      {slipFor && (
        <SlipModal
          item={slipFor}
          locked={r.status !== 'draft'}
          paid={r.status === 'paid'}
          runId={id}
          onClose={() => setSlipFor(null)}
        />
      )}
    </section>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-xs">
      <h3 className="text-sm font-semibold text-text-muted">{label}</h3>
      <p className="text-xl font-semibold text-text">{formatINRExact(value)}</p>
    </Card>
  );
}

function PayModal({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState('');
  const pay = useMutation({
    mutationFn: () => payRun(id, reference.trim()),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not mark the run as paid.'),
  });
  return (
    <Modal
      busy={pay.isPending}
      open
      onClose={onClose}
      title="Mark this run as paid"
      description="This is a simulated payment: it only records that the money was paid. Add a reference if you like (for example a bank transfer number)."
    >
      <form
        noValidate
        className="flex flex-col gap-md"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          pay.mutate();
        }}
      >
        <Input
          label="Payment reference (optional)"
          value={reference}
          maxLength={60}
          onChange={(e) => setReference(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pay.isPending} type="submit" disabled={pay.isPending}>
            Confirm paid
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SlipModal({
  item,
  locked,
  paid,
  runId,
  onClose,
}: {
  item: RunItem;
  locked: boolean;
  paid: boolean;
  runId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const slip = useQuery({ queryKey: ['a-item', item.id], queryFn: () => getItem(item.id) });
  const [kind, setKind] = useState<'bonus' | 'deduction'>('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [problem, setProblem] = useState('');
  const changed = (message: string) => {
    setProblem('');
    void queryClient.invalidateQueries({ queryKey: ['a-item', item.id] });
    void queryClient.invalidateQueries({ queryKey: ['a-run', runId] });
    void queryClient.invalidateQueries({ queryKey: ['a-runs'] });
    toast.show({ tone: 'success', title: message });
  };
  const add = useMutation({
    mutationFn: () => addAdjustment(item.id, { kind, amount, reason: reason.trim() }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      changed('Added. It is in the audit log.');
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not add that line.'),
  });
  const voidIt = useMutation({
    mutationFn: () => voidAdjustment(voiding, voidReason.trim()),
    onSuccess: () => {
      setVoiding('');
      setVoidReason('');
      changed('Voided. The line stays visible but no longer counts.');
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not void that line.'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!(Number(amount) > 0)) return setProblem('Enter an amount above zero.');
    if (reason.trim().length < 3) return setProblem('Write a short reason (at least 3 letters).');
    setProblem('');
    add.mutate();
  };
  return (
    <Modal
      busy={add.isPending || voidIt.isPending}
      open
      onClose={onClose}
      size="lg"
      title={`Payslip for ${item.name}`}
    >
      {slip.isPending ? (
        <LoadingState label="Loading the payslip…" />
      ) : slip.isError ? (
        <ErrorState
          description="We couldn't load the payslip."
          onRetry={() => void slip.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-md">
          <PayslipView slip={slip.data} />
          {!locked &&
            slip.data.adjustments
              .filter((a) => !a.voided)
              .map((a) => (
                <div key={a.id} className="no-print flex flex-wrap items-center gap-sm text-sm">
                  <span>
                    {a.kind_label}: {a.reason}
                  </span>
                  {voiding === a.id ? (
                    <>
                      <Input
                        label="Reason for voiding"
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                      />
                      <Button
                        loading={voidIt.isPending}
                        size="sm"
                        disabled={voidIt.isPending}
                        onClick={() => voidIt.mutate()}
                      >
                        Confirm void
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setVoiding(a.id)}>
                      Void “{a.reason}”
                    </Button>
                  )}
                </div>
              ))}
          {paid ? (
            <p className="no-print text-sm text-text-muted">
              This run is paid. Corrections go in the next month&apos;s run.
            </p>
          ) : (
            <form noValidate onSubmit={submit} className="no-print flex flex-col gap-sm">
              <h3 className="text-base font-semibold text-text">
                {locked ? 'Add a correction (run is approved)' : 'Add a bonus or deduction'}
              </h3>
              <Select
                label="Type"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'bonus' | 'deduction')}
                options={[
                  { value: 'bonus', label: 'Bonus' },
                  { value: 'deduction', label: 'Deduction' },
                ]}
              />
              <Input
                label="Amount (₹)"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              {problem && (
                <p role="alert" className="text-sm font-medium text-danger-text">
                  {problem}
                </p>
              )}
              <div>
                <Button loading={add.isPending} type="submit" disabled={add.isPending}>
                  Add line
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
