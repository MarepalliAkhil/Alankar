import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Kpi } from '../../api/stats';
import { cn } from '../../lib/cn';

export type Good = 'up' | 'down' | 'neutral';

interface StatTileProps {
  label: string;
  kpi: Kpi;
  /** How to show a value ("₹1,200", "4.5 / 5", "32 min"). */
  format: (value: number | string) => string;
  /** Which direction is good news, so a rise in cancellations is not shown as good. */
  good?: Good;
  /** Text for a value that is missing (no ratings yet, no requests yet). */
  empty?: string;
}

/** One KPI: the number, and how it compares with the period before (arrow AND words, not colour only). */
export function StatTile({ label, kpi, format, good = 'up', empty = 'No data' }: StatTileProps) {
  const has = kpi.value !== null && kpi.value !== undefined;
  const hadBefore = kpi.previous !== null && kpi.previous !== undefined;
  const pct = kpi.change_pct;
  let change: string;
  let Icon = ArrowRight;
  let tone = 'text-text-muted';
  if (!has || !hadBefore) {
    change = hadBefore ? 'No data this period' : 'Nothing to compare with';
  } else if (pct === null) {
    change = `Before: ${format(kpi.previous as number | string)}`;
  } else {
    const same = pct === 0;
    Icon = same ? ArrowRight : pct > 0 ? ArrowUpRight : ArrowDownRight;
    change = `${same ? 'No change' : `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct)}%`} from ${format(kpi.previous as number | string)}`;
    if (!same && good !== 'neutral') {
      const better = pct > 0 === (good === 'up');
      tone = better ? 'text-success-text' : 'text-danger-text';
    }
  }
  return (
    <div className="glass-dense flex min-w-0 flex-col gap-1 rounded-card p-md">
      <p className="text-sm text-text-muted">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums text-text',
          !has && 'text-lg text-text-muted',
        )}
      >
        {has ? format(kpi.value as number | string) : empty}
      </p>
      <p className={cn('flex items-center gap-1 text-xs', tone)}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>{change}</span>
      </p>
    </div>
  );
}
