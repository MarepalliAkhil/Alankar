import { Fragment } from 'react';
import type { FlowRole, RoleInfo } from '../../api/zenotians';
import { Badge } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { Bullets } from './parts';

/* All diagrams are inline SVG or CSS, drawn with theme colours (currentColor and CSS variables),
   readable on a phone (a second, vertical layout below 640px) and still when motion is reduced. */

const stroke = 'stroke-primary';
const nodeBox = 'fill-surface stroke-primary-light';
const label = 'fill-text text-[14px] font-semibold';
const small = 'fill-text-muted text-[12px]';

function Arrow({ id }: { id: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M0 0 L10 5 L0 10 z" className="fill-primary" />
    </marker>
  );
}

/** Lines of text inside an SVG (split on \n). */
function Lines({
  x,
  y,
  text,
  className,
  gap = 15,
}: {
  x: number;
  y: number;
  text: string;
  className: string;
  gap?: number;
}) {
  return (
    <text x={x} y={y} textAnchor="middle" className={className}>
      {text.split('\n').map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? 0 : gap}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

// --------------------------------------------------------------------------- the four roles

const ROLE_NAMES = ['Customer', 'Receptionist', 'Stylist', 'Admin'];

export function RolesDiagram({ roles }: { roles?: RoleInfo[] }) {
  const wide = useMediaQuery('(min-width: 640px)');
  const names = ROLE_NAMES.map((n, i) => roles?.[i]?.role || n);
  const [c, r, s, a] = names;
  if (wide) {
    return (
      <svg
        viewBox="0 0 720 330"
        role="img"
        aria-labelledby="roles-t roles-d"
        className="h-auto w-full"
      >
        <title id="roles-t">The four roles and how a visit moves between them</title>
        <desc id="roles-d">
          The customer sends a booking request to the receptionist. The receptionist confirms it
          with a stylist, time and room. The stylist does the service and the receptionist bills it.
          The customer pays, gets a receipt and rates the stylist. The admin oversees payroll,
          refunds, reports and the audit log.
        </desc>
        <defs>
          <Arrow id="ra" />
        </defs>
        {[
          [95, c],
          [275, r],
          [455, s],
          [635, a],
        ].map(([x, name], i) => (
          <g key={name as string} className="zen-flow-node">
            <rect
              x={(x as number) - 70}
              y={110}
              width={140}
              height={56}
              rx={14}
              className={nodeBox}
              strokeWidth={1.5}
            />
            <text x={x as number} y={144} textAnchor="middle" className={label}>
              {name as string}
            </text>
            {i === 3 && null}
          </g>
        ))}
        <g fill="none" strokeWidth={2} className={stroke} markerEnd="url(#ra)">
          <path d="M165 128 H203" className="zen-flow-line" markerEnd="url(#ra)" />
          <path d="M345 128 H383" className="zen-flow-line" markerEnd="url(#ra)" />
          <path
            d="M455 166 C455 235 275 235 275 168"
            className="zen-flow-line"
            markerEnd="url(#ra)"
          />
          <path d="M275 110 C275 40 95 40 95 108" className="zen-flow-line" markerEnd="url(#ra)" />
          <path d="M565 138 H530" strokeDasharray="2 6" />
        </g>
        <Lines x={184} y={118} text={'request'} className={small} />
        <Lines x={364} y={118} text={'confirmed'} className={small} />
        <Lines x={365} y={236} text={'service done, bill'} className={small} />
        <Lines x={185} y={46} text={'payment link, receipt'} className={small} />
        <Lines
          x={635}
          y={198}
          text={'reviews payroll, refunds,\nreports and the audit log'}
          className={small}
        />
        <Lines x={95} y={192} text={'rates the stylist'} className={small} />
      </svg>
    );
  }
  const ys = [20, 100, 180, 260];
  return (
    <svg
      viewBox="0 0 320 360"
      role="img"
      aria-labelledby="roles-t2 roles-d2"
      className="h-auto w-full"
    >
      <title id="roles-t2">The four roles and how a visit moves between them</title>
      <desc id="roles-d2">
        Customer to receptionist to stylist, then billing and rating, with the admin overseeing
        payroll, refunds, reports and the audit log.
      </desc>
      <defs>
        <Arrow id="ra2" />
      </defs>
      {names.map((name, i) => (
        <g key={name} className="zen-flow-node">
          <rect
            x={20}
            y={ys[i]}
            width={150}
            height={48}
            rx={14}
            className={nodeBox}
            strokeWidth={1.5}
          />
          <text x={95} y={ys[i]! + 29} textAnchor="middle" className={label}>
            {name}
          </text>
        </g>
      ))}
      <g fill="none" strokeWidth={2} className={stroke}>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M95 ${ys[i]! + 48} V${ys[i + 1]! - 2}`}
            className="zen-flow-line"
            markerEnd="url(#ra2)"
          />
        ))}
      </g>
      {[
        'sends a request, pays,\nrates the stylist',
        'confirms, checks in,\nbills',
        'does the service',
        'payroll, refunds, reports,\naudit log',
      ].map((t, i) => (
        <Lines key={t} x={246} y={ys[i]! + 22} text={t} className={small} />
      ))}
    </svg>
  );
}

// --------------------------------------------------------------------------- booking lifecycle

const STEPS: { id: string; label: string; actor: string }[] = [
  { id: 'requested', label: 'Requested', actor: 'customer\nsends' },
  { id: 'awaiting', label: 'Awaiting\npayment', actor: 'desk\nconfirms' },
  { id: 'scheduled', label: 'Scheduled', actor: 'customer\npays' },
  { id: 'checked', label: 'Checked in', actor: 'desk\nchecks in' },
  { id: 'progress', label: 'In progress', actor: 'stylist\nstarts' },
  { id: 'completed', label: 'Completed', actor: 'stylist\ncompletes' },
];
const EXITS: { from: number; label: string }[] = [
  { from: 0, label: 'Rejected' },
  { from: 1, label: 'Payment\nexpired' },
  { from: 2, label: 'Cancelled\nor no-show' },
];

export function LifecycleDiagram() {
  const wide = useMediaQuery('(min-width: 640px)');
  const note = (
    <p className="mt-sm text-sm text-text-muted">
      Other endings: rejected, payment_expired, cancelled and no_show. After completion the visit is
      billed and the customer rates the stylist.
    </p>
  );
  if (wide) {
    const xs = STEPS.map((_, i) => 62 + i * 119);
    return (
      <>
        <svg
          viewBox="0 0 720 250"
          role="img"
          aria-labelledby="life-t life-d"
          className="h-auto w-full"
        >
          <title id="life-t">The booking lifecycle</title>
          <desc id="life-d">
            Requested, awaiting payment, scheduled, checked in, in progress, completed. A request
            can be rejected, an unpaid link expires, and a scheduled visit can be cancelled or a
            no-show.
          </desc>
          <defs>
            <Arrow id="la" />
          </defs>
          {STEPS.map((step, i) => (
            <g key={step.id} className="zen-flow-node">
              <rect
                x={xs[i]! - 50}
                y={20}
                width={100}
                height={52}
                rx={12}
                className={cn(nodeBox)}
                strokeWidth={1.5}
              />
              <Lines
                x={xs[i]!}
                y={step.label.includes('\n') ? 41 : 51}
                text={step.label}
                className={label}
              />
              <Lines x={xs[i]!} y={96} text={step.actor} className={small} gap={14} />
            </g>
          ))}
          <g fill="none" strokeWidth={2} className={stroke}>
            {xs.slice(0, -1).map((x, i) => (
              <path
                key={i}
                d={`M${x + 50} 46 H${xs[i + 1]! - 52}`}
                className="zen-flow-line"
                markerEnd="url(#la)"
              />
            ))}
          </g>
          {EXITS.map((exit) => (
            <Fragment key={exit.label}>
              <path
                d={`M${xs[exit.from]!} 130 V168`}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                className="stroke-text-muted"
                markerEnd="url(#la)"
              />
              <rect
                x={xs[exit.from]! - 48}
                y={170}
                width={96}
                height={46}
                rx={12}
                className="fill-surface stroke-border"
                strokeDasharray="4 4"
              />
              <Lines
                x={xs[exit.from]!}
                y={exit.label.includes('\n') ? 189 : 198}
                text={exit.label}
                className="fill-text-muted text-[12px] font-medium"
                gap={14}
              />
            </Fragment>
          ))}
        </svg>
        {note}
      </>
    );
  }
  return (
    <>
      <svg
        viewBox="0 0 320 470"
        role="img"
        aria-labelledby="life-t2 life-d2"
        className="h-auto w-full"
      >
        <title id="life-t2">The booking lifecycle</title>
        <desc id="life-d2">
          Requested, awaiting payment, scheduled, checked in, in progress, completed.
        </desc>
        <defs>
          <Arrow id="la2" />
        </defs>
        {STEPS.map((step, i) => {
          const y = 10 + i * 76;
          return (
            <g key={step.id} className="zen-flow-node">
              <rect
                x={20}
                y={y}
                width={150}
                height={44}
                rx={12}
                className={nodeBox}
                strokeWidth={1.5}
              />
              <text x={95} y={y + 27} textAnchor="middle" className={label}>
                {step.label.replace('\n', ' ')}
              </text>
              <Lines x={246} y={y + 19} text={step.actor} className={small} gap={14} />
              {i < STEPS.length - 1 && (
                <path
                  d={`M95 ${y + 44} V${y + 74}`}
                  fill="none"
                  strokeWidth={2}
                  className={cn(stroke, 'zen-flow-line')}
                  markerEnd="url(#la2)"
                />
              )}
            </g>
          );
        })}
      </svg>
      {note}
    </>
  );
}

// --------------------------------------------------------------------------- future vision

function Connector({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('h-6 w-6 shrink-0 text-primary', className)}
    >
      <path
        d="M4 12 H18 M13 6 L19 12 L13 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="zen-flow-line"
      />
    </svg>
  );
}

function Stage({
  title,
  badge,
  items,
  future,
}: {
  title: string;
  badge?: string;
  items?: string[];
  future?: boolean;
}) {
  return (
    <div
      className={cn(
        'zen-flow-node flex min-w-0 flex-1 flex-col gap-2 rounded-card p-4',
        future ? 'border-2 border-dashed border-primary-light bg-primary-soft' : 'glass-dense',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">{title}</h3>
        {badge && <Badge tone={future ? 'warning' : 'primary'}>{badge}</Badge>}
      </div>
      <Bullets items={items} className="text-sm" />
    </div>
  );
}

/** data in -> today's deterministic engine -> optional future AI layer -> guardrails. */
export function FlowDiagram({ flow }: { flow: FlowRole }) {
  return (
    <div
      role="group"
      aria-label={`${flow.role}: data in, today, future layer, guardrails`}
      className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-stretch"
    >
      <Stage title="Data in" items={flow.data_in} />
      <Connector className="self-center rotate-90 lg:rotate-0" />
      <Stage title="Today" badge="Built, no AI" items={flow.today} />
      <Connector className="self-center rotate-90 lg:rotate-0" />
      <Stage title="Future layer" badge="Not built" items={flow.future} future />
      <Connector className="self-center rotate-90 lg:rotate-0" />
      <Stage title="Guardrails" items={flow.guardrails} />
    </div>
  );
}

/** One picture that connects the four roles to the shared engine, the future layer and guardrails. */
export function VisionOverviewDiagram({ roles }: { roles?: FlowRole[] }) {
  const wide = useMediaQuery('(min-width: 640px)');
  const names = ROLE_NAMES.map((n, i) => roles?.[i]?.role || n);
  if (wide) {
    const xs = [85, 245, 405, 565];
    return (
      <svg viewBox="0 0 650 340" role="img" aria-labelledby="vo-t vo-d" className="h-auto w-full">
        <title id="vo-t">How the four roles share one engine and the same guardrails</title>
        <desc id="vo-d">
          Customer, receptionist, stylist and admin all use the rule-based engine that exists today.
          A possible future layer would sit above it, and all of it sits inside the same guardrails.
        </desc>
        <defs>
          <Arrow id="va" />
        </defs>
        <rect
          x={5}
          y={5}
          width={640}
          height={330}
          rx={18}
          fill="none"
          strokeWidth={2}
          strokeDasharray="3 6"
          className="stroke-primary-light"
        />
        <text x={325} y={28} textAnchor="middle" className={small}>
          Guardrails: privacy, a person confirms, audit log, consent
        </text>
        {names.map((name, i) => (
          <g key={name} className="zen-flow-node">
            <rect
              x={xs[i]! - 62}
              y={50}
              width={124}
              height={44}
              rx={12}
              className={nodeBox}
              strokeWidth={1.5}
            />
            <text x={xs[i]!} y={77} textAnchor="middle" className={label}>
              {name}
            </text>
            <path
              d={`M${xs[i]!} 94 L${[225, 290, 360, 425][i]} 148`}
              fill="none"
              strokeWidth={2}
              className={cn(stroke, 'zen-flow-line')}
              markerEnd="url(#va)"
            />
          </g>
        ))}
        <rect
          x={185}
          y={150}
          width={280}
          height={60}
          rx={16}
          className="fill-surface stroke-primary"
          strokeWidth={2}
        />
        <Lines
          x={325}
          y={176}
          text={'Today: rules and statistics\nover the shop’s own data'}
          className={label}
          gap={17}
        />
        <path
          d="M325 210 V246"
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 4"
          className={stroke}
          markerEnd="url(#va)"
        />
        <rect
          x={185}
          y={250}
          width={280}
          height={56}
          rx={16}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 5"
          className="stroke-primary-light"
        />
        <Lines
          x={325}
          y={274}
          text={'Possible future AI layer\nconcept only, not built'}
          className={small}
          gap={16}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 520" role="img" aria-labelledby="vo-t2 vo-d2" className="h-auto w-full">
      <title id="vo-t2">How the four roles share one engine and the same guardrails</title>
      <desc id="vo-d2">
        All four roles use the rule-based engine that exists today; a possible future layer sits
        above it, inside the same guardrails.
      </desc>
      <defs>
        <Arrow id="va2" />
      </defs>
      <rect
        x={4}
        y={4}
        width={312}
        height={512}
        rx={16}
        fill="none"
        strokeWidth={2}
        strokeDasharray="3 6"
        className="stroke-primary-light"
      />
      <text x={160} y={26} textAnchor="middle" className={small}>
        Guardrails: privacy, a person confirms,
      </text>
      <text x={160} y={42} textAnchor="middle" className={small}>
        audit log, consent
      </text>
      {names.map((name, i) => {
        const y = 58 + i * 52;
        return (
          <g key={name} className="zen-flow-node">
            <rect
              x={40}
              y={y}
              width={240}
              height={38}
              rx={11}
              className={nodeBox}
              strokeWidth={1.5}
            />
            <text x={160} y={y + 24} textAnchor="middle" className={label}>
              {name}
            </text>
          </g>
        );
      })}
      <path
        d="M160 266 V296"
        fill="none"
        strokeWidth={2}
        className={cn(stroke, 'zen-flow-line')}
        markerEnd="url(#va2)"
      />
      <rect
        x={30}
        y={298}
        width={260}
        height={64}
        rx={14}
        className="fill-surface stroke-primary"
        strokeWidth={2}
      />
      <Lines
        x={160}
        y={325}
        text={'Today: rules and statistics\nover the shop’s own data'}
        className={label}
        gap={17}
      />
      <path
        d="M160 362 V392"
        fill="none"
        strokeWidth={2}
        strokeDasharray="4 4"
        className={stroke}
        markerEnd="url(#va2)"
      />
      <rect
        x={30}
        y={394}
        width={260}
        height={64}
        rx={14}
        fill="none"
        strokeWidth={2}
        strokeDasharray="6 5"
        className="stroke-primary-light"
      />
      <Lines
        x={160}
        y={421}
        text={'Possible future AI layer\nconcept only, not built'}
        className={small}
        gap={16}
      />
    </svg>
  );
}
