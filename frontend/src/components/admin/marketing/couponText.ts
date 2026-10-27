import type { CouponRow } from '../../../api/marketing';
import { formatINR } from '../../../lib/format';

/** One line that says what a coupon does. */
export function describe(c: CouponRow): string {
  const off = c.kind === 'percent' ? `${Number(c.value)}% off` : `${formatINR(c.value)} off`;
  const parts = [off];
  if (c.max_discount) parts.push(`up to ${formatINR(c.max_discount)}`);
  if (Number(c.min_bill) > 0) parts.push(`bills of ${formatINR(c.min_bill)} or more`);
  parts.push(c.applies_to === 'all' ? 'whole bill' : `${c.applies_to} only`);
  return parts.join(' · ');
}
