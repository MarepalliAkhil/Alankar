import type { Payslip } from '../api/payroll';
import { formatDateTime, formatINRExact, monthName } from '../lib/format';
import { Badge, Button } from './ui';

/**
 * One payslip. Base pay, tips and every bonus or deduction are separate lines; nothing is merged
 * into the base. A voided adjustment stays visible but does not count. Printable with the browser.
 */
export default function PayslipView({ slip }: { slip: Payslip }) {
  const baseLabel =
    slip.role === 'stylist'
      ? 'Task payouts (after the rating multiplier)'
      : 'Hours worked × hourly rate';
  return (
    <article className="payslip-print flex flex-col gap-md" aria-label={`Payslip ${slip.name}`}>
      <header className="flex flex-col gap-xs">
        <h2 className="text-lg font-semibold text-text">
          Payslip: {slip.name}, {monthName(slip.run.month)}
        </h2>
        <p className="text-sm text-text-muted">
          <Badge tone={slip.run.status === 'paid' ? 'success' : 'warning'}>
            {slip.run.status_label}
          </Badge>{' '}
          {slip.run.status === 'paid' && slip.run.paid_at
            ? `Paid on ${formatDateTime(slip.run.paid_at)} (simulated payment)${
                slip.run.payment_reference ? `, reference ${slip.run.payment_reference}` : ''
              }.`
            : slip.run.approved_at
              ? `Approved on ${formatDateTime(slip.run.approved_at)}.`
              : 'Draft: not final yet.'}
        </p>
      </header>
      <table className="w-full text-sm">
        <caption className="sr-only">Pay lines</caption>
        <thead>
          <tr className="border-b border-border text-left text-text-muted">
            <th scope="col" className="py-xs font-medium">
              Line
            </th>
            <th scope="col" className="py-xs text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-xs">{baseLabel}</td>
            <td className="py-xs text-right">{formatINRExact(slip.base_pay)}</td>
          </tr>
          {slip.role === 'stylist' && (
            <tr className="border-b border-border">
              <td className="py-xs">Tips</td>
              <td className="py-xs text-right">{formatINRExact(slip.tips)}</td>
            </tr>
          )}
          {slip.adjustments.map((a) => (
            <tr key={a.id} className="border-b border-border">
              <td className="py-xs">
                <span className={a.voided ? 'line-through' : ''}>
                  {a.kind_label}: {a.reason}
                </span>
                {a.after_approval && (
                  <span className="text-xs text-text-muted"> (added after approval)</span>
                )}
                {a.voided && (
                  <span className="text-xs text-text-muted">
                    {' '}
                    (voided{a.void_reason ? `: ${a.void_reason}` : ''})
                  </span>
                )}
              </td>
              <td className={`py-xs text-right ${a.voided ? 'line-through' : ''}`}>
                {a.kind === 'deduction' ? '−' : '+'}
                {formatINRExact(a.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="py-xs text-left font-semibold">
              Net pay
            </th>
            <td className="py-xs text-right text-lg font-semibold">{formatINRExact(slip.net)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="no-print">
        <Button variant="secondary" onClick={() => window.print()}>
          Print payslip
        </Button>
      </div>
    </article>
  );
}
