const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export interface DateRange {
  from: string;
  to: string;
}

export const PRESETS: { id: string; label: string; range: (today: Date) => DateRange }[] = [
  { id: '7', label: 'Last 7 days', range: (t) => ({ from: day(addDays(t, -6)), to: day(t) }) },
  { id: '30', label: 'Last 30 days', range: (t) => ({ from: day(addDays(t, -29)), to: day(t) }) },
  { id: 'month', label: 'This month', range: (t) => ({ from: day(startOfMonth(t)), to: day(t) }) },
  { id: '90', label: 'Last 90 days', range: (t) => ({ from: day(addDays(t, -89)), to: day(t) }) },
];

export const defaultRange = (today: Date = new Date()): DateRange => PRESETS[1].range(today);

/** A problem with the chosen dates, or null when they are fine. */
export function rangeProblem(range: DateRange): string | null {
  if (!range.from || !range.to) return 'Choose both dates.';
  if (range.from > range.to) return 'The start date is after the end date.';
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  if (days >= 366) return 'Choose a range of at most one year.';
  return null;
}
