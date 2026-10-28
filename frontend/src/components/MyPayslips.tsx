import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { myPayslip, myPayslips } from '../api/payroll';
import PayslipView from './PayslipView';
import { Button, Card, ErrorState, LoadingState } from './ui';
import { formatINRExact, monthName } from '../lib/format';

/** The signed-in stylist's or receptionist's own payslips (approved or paid runs only). */
export default function MyPayslips() {
  const [open, setOpen] = useState('');
  const list = useQuery({ queryKey: ['my-payslips'], queryFn: myPayslips });
  const slip = useQuery({
    queryKey: ['my-payslips', open],
    queryFn: () => myPayslip(open),
    enabled: Boolean(open),
  });
  return (
    <Card className="flex flex-col gap-sm">
      <h2 className="text-lg font-semibold text-text">Payslips</h2>
      {list.isPending ? (
        <LoadingState label="Loading payslips…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load your payslips."
          onRetry={() => void list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-text-muted">
          No payslips yet. A payslip appears here when the admin approves the month&apos;s payroll.
        </p>
      ) : (
        <ul className="flex flex-col gap-xs" aria-label="Payslips">
          {list.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-sm">
              <span className="text-sm text-text">
                {monthName(p.month)} · {p.status_label} · {formatINRExact(p.net)}
              </span>
              <Button
                size="sm"
                variant={open === p.id ? 'secondary' : 'primary'}
                aria-expanded={open === p.id}
                onClick={() => setOpen(open === p.id ? '' : p.id)}
              >
                {open === p.id ? 'Hide payslip' : `View payslip for ${monthName(p.month)}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open &&
        (slip.isPending ? (
          <LoadingState label="Loading the payslip…" />
        ) : slip.isError ? (
          <p className="text-sm text-text-muted">We couldn&apos;t load that payslip.</p>
        ) : (
          <PayslipView slip={slip.data} />
        ))}
    </Card>
  );
}
