import { formatINR } from '../../lib/format';
import type { Report, ReportRow } from '../../api/reports';

const LEVELS = [
  'text-text-muted',
  'bg-primary-soft text-text',
  'bg-primary-light text-on-primary',
  'bg-primary text-on-primary',
  'bg-primary-hover text-on-primary',
];

/** Weekday by hour grid. Darker means busier; every cell also shows its number. */
export default function HeatmapView({ report }: { report: Report }) {
  const hours = report.chart.hours ?? [];
  const money = report.columns.find((c) => c.key === hours[0])?.kind === 'money';
  const value = (row: ReportRow, key: string) => Number(row[key] ?? 0);
  const peak = Math.max(0, ...report.rows.flatMap((r) => hours.map((h) => value(r, h))));
  const level = (n: number) => (n <= 0 || peak <= 0 ? 0 : Math.min(4, Math.ceil((n / peak) * 4)));
  const show = (n: number) => (n <= 0 ? '–' : money ? formatINR(String(n)) : String(n));
  const label = (key: string) => report.columns.find((c) => c.key === key)?.label ?? key;
  return (
    <div className="mt-md overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <caption className="sr-only">{report.label}: busiest days and hours</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left text-text-muted">
              Day
            </th>
            {hours.map((h) => (
              <th key={h} scope="col" className="font-medium text-text-muted">
                {label(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={String(row.weekday)}>
              <th scope="row" className="whitespace-nowrap text-left font-medium text-text">
                {String(row.weekday)}
              </th>
              {hours.map((h) => {
                const n = value(row, h);
                return (
                  <td
                    key={h}
                    className={`rounded-nested px-xs py-sm tabular-nums ${LEVELS[level(n)]}`}
                  >
                    {show(n)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
