import { Check, CircleDashed, Clock, Minus, TriangleAlert } from 'lucide-react';
import type { TimelineStep } from '../../api/booking';
import { formatDateTime } from '../../lib/format';

const ICONS = {
  done: Check,
  waiting: Clock,
  stopped: Minus,
  problem: TriangleAlert,
  skipped: CircleDashed,
} as const;

const TONE = {
  done: 'bg-success-soft text-success-text',
  waiting: 'bg-primary-soft text-primary-hover',
  stopped: 'bg-primary-soft text-text-muted',
  problem: 'bg-danger-soft text-danger-text',
  skipped: 'bg-primary-soft text-text-muted',
} as const;

/** Where a booking request is: a list (not colour alone) with a text status on every step.
 * It never moves, so reduced-motion settings need nothing special. */
export function RequestTimeline({ steps, name }: { steps: TimelineStep[]; name: string }) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-xs font-medium text-text-muted" id={`timeline-${name}`}>
        Where your request is
      </p>
      <ol aria-labelledby={`timeline-${name}`} className="flex flex-col gap-xs">
        {steps.map((step) => {
          const Icon = ICONS[step.state];
          return (
            <li
              key={step.key}
              data-state={step.state}
              className="flex items-start gap-sm rounded-nested px-sm py-xs text-sm"
            >
              <span
                aria-hidden="true"
                className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TONE[step.state]}`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium text-text">{step.label}</span>
                <span className="text-text-muted">{': '}</span>
                <span className="text-text">{step.text}</span>
                {step.at && step.state === 'done' && (
                  <span className="block text-xs text-text-muted">{formatDateTime(step.at)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
