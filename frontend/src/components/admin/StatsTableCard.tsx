import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StatsRow, StatsTable } from '../../api/stats';
import { formatINR } from '../../lib/format';
import { Button, Card, EmptyState, Table, type Column } from '../ui';

interface StatsTableCardProps {
  title: string;
  description?: string;
  table: StatsTable;
  /** Shown above the table: usually the chart of the same data. */
  chart?: ReactNode;
  emptyTitle: string;
  emptyText: string;
  onExport: () => void;
  exporting?: boolean;
  /** Keep the data table hidden behind "Show as a table" (it is always there for screen readers). */
  collapsible?: boolean;
}

const show = (kind: string, value: StatsRow[string]) => {
  if (value === null || value === undefined || value === '') return '–';
  return kind === 'money' ? formatINR(value) : String(value);
};

/** A chart (optional) with the same numbers as a real table and a CSV download. */
export function StatsTableCard({
  title,
  description,
  table,
  chart,
  emptyTitle,
  emptyText,
  onExport,
  exporting,
  collapsible = true,
}: StatsTableCardProps) {
  const columns: Column<StatsRow>[] = table.columns.map((c) => ({
    key: c.key,
    header: c.label,
    className: c.kind === 'text' ? '' : 'text-right',
    render: (row) => (
      <span className={c.kind === 'text' ? '' : 'tabular-nums'}>{show(c.kind, row[c.key])}</span>
    ),
  }));
  const rows = table.totals ? [...table.rows, { ...table.totals, __total: 1 }] : table.rows;
  const grid = (
    <Table
      caption={title}
      columns={columns}
      rows={rows}
      rowKey={(row) =>
        String(
          row.__total
            ? 'total'
            : (row.date ??
                row.name ??
                row.stream ??
                row.status ??
                row.month ??
                JSON.stringify(row)),
        )
      }
    />
  );
  return (
    <Card variant="dense" as="section" aria-label={title} className="flex min-w-0 flex-col gap-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h3 className="text-lg font-semibold text-text">{title}</h3>
          {description && <p className="text-sm text-text-muted">{description}</p>}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onExport}
          loading={exporting}
          disabled={table.rows.length === 0}
          aria-label={`Download ${title} as CSV`}
        >
          <Download aria-hidden="true" className="h-4 w-4" /> CSV
        </Button>
      </div>
      {table.rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyText} />
      ) : (
        <>
          {chart}
          {chart && collapsible ? (
            <details className="group">
              <summary className="cursor-pointer rounded text-sm font-medium text-primary-hover focus-visible:shadow-focus focus-visible:outline-none">
                Show the numbers as a table
              </summary>
              <div className="mt-sm">{grid}</div>
            </details>
          ) : (
            grid
          )}
        </>
      )}
    </Card>
  );
}
