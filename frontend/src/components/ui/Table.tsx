import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyMessage?: string;
}

/** Simple data table. Scrolls horizontally on small screens. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = 'Nothing to show yet.',
}: TableProps<T>) {
  return (
    <div className="glass-dense overflow-x-auto rounded-card">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-md py-3 font-semibold text-text-muted', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-md py-lg text-center text-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-md py-3 text-text', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
