import type { StatsTable } from '../../api/stats';

/**
 * Plain helpers for the AIR Activity page (no React): colour-blind-safe series, chart data and
 * the one-sentence text summary each chart carries, and a CSV of any table.
 */

/** Okabe-Ito colours (design tokens in design/index.css), safe with common colour blindness. */
export const SAFE = {
  blue: 'var(--chart-cb-blue)',
  orange: 'var(--chart-cb-orange)',
  green: 'var(--chart-cb-green)',
  vermillion: 'var(--chart-cb-vermillion)',
  purple: 'var(--chart-cb-purple)',
  sky: 'var(--chart-cb-sky)',
  grey: 'var(--chart-cb-grey)',
} as const;

export const TYPE_SERIES = [
  { key: 'booking', label: 'Bookings', color: SAFE.blue },
  { key: 'payment', label: 'Payment links', color: SAFE.orange },
  { key: 'order', label: 'Product orders', color: SAFE.green },
  { key: 'handoff', label: 'Handed to a person', color: SAFE.vermillion },
  { key: 'other', label: 'Other', color: SAFE.grey },
] as const;

export const STYLIST_SERIES = [
  { key: 'accepted', label: 'Accepted', color: SAFE.green },
  { key: 'declined', label: 'Declined', color: SAFE.vermillion },
  { key: 'timed_out', label: 'No answer in time', color: SAFE.orange },
  { key: 'waiting', label: 'Waiting', color: SAFE.sky },
] as const;

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function hourlySummary(table: StatsTable): string {
  const total = num(table.totals?.total);
  if (!total) return 'AIR took no actions in this range.';
  const busiest = [...table.rows].sort((a, b) => num(b.total) - num(a.total))[0];
  const parts = TYPE_SERIES.map((s) => `${num(table.totals?.[s.key])} ${s.label.toLowerCase()}`);
  return `${total} actions in all: ${parts.join(', ')}. Busiest hour: ${busiest.hour} with ${num(busiest.total)}.`;
}

export function funnelSummary(funnel: StatsTable, lost: StatsTable): string {
  const steps = funnel.rows.map((r) => `${r.step}: ${num(r.count)}`).join('; ');
  const ended = lost.rows.map((r) => `${String(r.step).toLowerCase()} ${num(r.count)}`).join(', ');
  return `${steps}. Ended without a booking: ${ended}.`;
}

export function linksSummary(links: StatsTable): string {
  const sent = num(links.totals?.count);
  if (!sent) return 'No payment links were sent in this range.';
  return `${sent} links sent: ${links.rows.map((r) => `${num(r.count)} ${String(r.status).toLowerCase()}`).join(', ')}.`;
}

export function stylistSummary(table: StatsTable): string {
  if (!table.rows.length) return 'No stylist had to answer an AIR request in this range.';
  return table.rows
    .map(
      (r) =>
        `${r.name}: ${num(r.accepted)} accepted, ${num(r.declined)} declined, ${num(r.timed_out)} not answered in time, ${num(r.waiting)} waiting`,
    )
    .join('. ')
    .concat('.');
}

export function trendSummary(table: StatsTable, chat: number, voice: number): string {
  const days = table.rows.filter((r) => r.rate !== null && r.rate !== undefined);
  const latest = days.at(-1);
  return (
    `In this range: ${chat} chat and ${voice} voice conversations. ` +
    (latest
      ? `Handover rate on the last day with conversations (${latest.date}): ${latest.rate}%.`
      : 'No conversations in the last 7 days, so there is no handover rate.')
  );
}

export function productsSummary(table: StatsTable): string {
  if (!table.rows.length) return 'AIR did not change any product stock in this range.';
  return table.rows
    .map((r) => `${r.name}: ${num(r.units)} units, stock ${r.stock_before} to ${r.stock_after}`)
    .join('; ')
    .concat('.');
}

/** A CSV of a table with its columns in order (Excel-safe: cells starting with = + - @ quoted). */
export function tableCsv(table: StatsTable): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = table.totals ? [...table.rows, table.totals] : table.rows;
  return [
    table.columns.map((c) => cell(c.label)).join(','),
    ...rows.map((r) => table.columns.map((c) => cell(r[c.key])).join(',')),
  ].join('\n');
}

export const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const timeOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '';
