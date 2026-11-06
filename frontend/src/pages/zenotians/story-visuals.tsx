import type { ReactNode } from 'react';
import type { StoryVisual } from '../../api/zenotians';

/* Seven small original scenes for "A day at Alankar". Flat shapes drawn with the theme's colours,
   no photos and no stock people: the four characters are a circle and a pair of shoulders with an
   initial. Each scene is one labelled image; its words are for people who can see it, and the
   label says the same thing for people who cannot. */

const card = 'fill-surface stroke-border';
const ink = 'fill-text text-[13px] font-semibold';
const soft = 'fill-text-muted text-[12px]';
const onPrimary = 'fill-white text-[13px] font-semibold';

function Scene({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={label} className="h-auto w-full">
      <rect width="360" height="220" rx="16" className="fill-primary-soft" />
      {children}
    </svg>
  );
}

function Person({ x, y, initial, name }: { x: number; y: number; initial: string; name?: string }) {
  return (
    <g>
      <path d={`M${x - 22} ${y + 44} q22 -30 44 0 z`} className="fill-primary" />
      <circle cx={x} cy={y} r="15" className="fill-primary-hover" />
      <text x={x} y={y + 5} textAnchor="middle" className={onPrimary}>
        {initial}
      </text>
      {name && (
        <text x={x} y={y + 62} textAnchor="middle" className={soft}>
          {name}
        </text>
      )}
    </g>
  );
}

function Tick({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="11" className="fill-success" />
      <path
        d={`M${x - 5} ${y} l4 4 l7 -8`}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="story-draw stroke-white"
        data-delay={delay}
      />
    </g>
  );
}

function Lock({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y + 7} width="18" height="14" rx="3" className="fill-primary-hover" />
      <path
        d={`M${x + 4} ${y + 7} v-3 a5 5 0 0 1 10 0 v3`}
        fill="none"
        strokeWidth="2.2"
        className="stroke-primary-hover"
      />
    </g>
  );
}

function Request() {
  return (
    <Scene label="Priya on her phone: a four-step booking form (Service, Time, Details, Review) with the second step open, and a calendar with Saturday week marked.">
      <Person x={64} y={70} initial="P" name="Priya" />
      <rect x="120" y="22" width="112" height="180" rx="16" className={card} strokeWidth="2" />
      <rect x="146" y="30" width="60" height="5" rx="2.5" className="fill-border" />
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={i}
          cx={142 + i * 24}
          cy="56"
          r="7"
          className={i < 2 ? 'fill-primary' : 'fill-border'}
        />
      ))}
      <rect x="134" y="76" width="84" height="12" rx="6" className="fill-primary-soft" />
      <rect x="134" y="96" width="84" height="12" rx="6" className="fill-primary-soft" />
      <rect x="134" y="116" width="56" height="12" rx="6" className="fill-primary-soft" />
      <rect x="134" y="168" width="84" height="22" rx="11" className="fill-primary" />
      <text x="176" y="183" textAnchor="middle" className={onPrimary}>
        Next
      </text>
      <rect x="252" y="40" width="92" height="104" rx="12" className={card} strokeWidth="1.5" />
      <text x="298" y="60" textAnchor="middle" className={ink}>
        Saturday
      </text>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
        <circle
          key={i}
          cx={268 + (i % 4) * 22}
          cy={82 + Math.floor(i / 4) * 22}
          r="7"
          className={i === 6 ? 'fill-primary' : 'fill-primary-soft'}
        />
      ))}
      <rect x="252" y="156" width="92" height="30" rx="15" className="fill-warning-soft" />
      <text x="298" y="175" textAnchor="middle" className={ink}>
        Request sent
      </text>
    </Scene>
  );
}

function Approval() {
  return (
    <Scene label="Two cards, Front desk with Rahul and Stylist with Meera, each ticked. Both ticks lead to a Ready to pay badge.">
      <rect x="18" y="26" width="120" height="86" rx="14" className={card} strokeWidth="1.5" />
      <text x="78" y="48" textAnchor="middle" className={ink}>
        Front desk
      </text>
      <Person x={50} y={66} initial="R" />
      <text x="96" y="76" className={soft}>
        picks a
      </text>
      <text x="96" y="92" className={soft}>
        room
      </text>
      <Tick x={118} y={34} />
      <rect x="18" y="124" width="120" height="86" rx="14" className={card} strokeWidth="1.5" />
      <text x="78" y="146" textAnchor="middle" className={ink}>
        Stylist
      </text>
      <Person x={50} y={164} initial="M" />
      <text x="96" y="174" className={soft}>
        is free
      </text>
      <Tick x={118} y={132} delay={1} />
      <path
        d="M140 70 C170 70 170 118 198 118 M140 166 C170 166 170 118 198 118"
        fill="none"
        strokeWidth="2.5"
        className="zen-flow-line stroke-primary"
      />
      <rect
        x="204"
        y="86"
        width="140"
        height="64"
        rx="14"
        className="fill-surface stroke-primary"
      />
      <text x="274" y="112" textAnchor="middle" className={ink}>
        Both said yes
      </text>
      <rect x="226" y="122" width="96" height="20" rx="10" className="fill-success" />
      <text x="274" y="136" textAnchor="middle" className={onPrimary}>
        Ready to pay
      </text>
    </Scene>
  );
}

function Twist() {
  return (
    <Scene label="Meera declines. A kind note says she cannot make that time, a Choose another time button opens the form again, and the slot she held is free.">
      <rect x="18" y="22" width="150" height="72" rx="14" className={card} strokeWidth="1.5" />
      <Person x={46} y={42} initial="M" />
      <circle cx="140" cy="38" r="11" className="fill-danger" />
      <path
        d="M135 33 l10 10 M145 33 l-10 10"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-white"
      />
      <text x="96" y="64" className={soft}>
        Declined
      </text>
      <text x="96" y="82" className={soft}>
        (private reason)
      </text>
      <rect x="18" y="108" width="196" height="96" rx="14" className={card} strokeWidth="1.5" />
      <Person x={46} y={128} initial="P" />
      <text x="76" y="132" className={ink}>
        We are sorry,
      </text>
      <text x="76" y="150" className={soft}>
        Meera cannot make
      </text>
      <text x="76" y="166" className={soft}>
        that time.
      </text>
      <rect x="76" y="176" width="124" height="22" rx="11" className="fill-primary" />
      <text x="138" y="191" textAnchor="middle" className={onPrimary}>
        Choose another time
      </text>
      <rect x="232" y="22" width="112" height="182" rx="14" className={card} strokeWidth="1.5" />
      <text x="288" y="44" textAnchor="middle" className={ink}>
        Times
      </text>
      {['10:00', '10:30', '11:00', '11:30', '12:00'].map((t, i) => (
        <g key={t}>
          <rect
            x="248"
            y={54 + i * 29}
            width="80"
            height="22"
            rx="11"
            className={i === 1 ? 'fill-border' : i === 3 ? 'fill-primary' : 'fill-primary-soft'}
          />
          <text x="288" y={69 + i * 29} textAnchor="middle" className={i === 3 ? onPrimary : soft}>
            {i === 1 ? 'taken' : t}
          </text>
        </g>
      ))}
    </Scene>
  );
}

function Pay() {
  return (
    <Scene label="A payment page marked Test payment, no real money. Next to it, a private chat between Priya and Meera with a photo tagged Style reference.">
      <rect x="18" y="26" width="140" height="168" rx="14" className={card} strokeWidth="1.5" />
      <text x="88" y="50" textAnchor="middle" className={ink}>
        Pay to keep it
      </text>
      <rect x="34" y="62" width="108" height="14" rx="7" className="fill-primary-soft" />
      <rect x="34" y="84" width="76" height="14" rx="7" className="fill-primary-soft" />
      <rect x="34" y="118" width="108" height="26" rx="13" className="fill-primary" />
      <text x="88" y="136" textAnchor="middle" className={onPrimary}>
        Pay now
      </text>
      <rect x="34" y="156" width="108" height="24" rx="12" className="fill-warning-soft" />
      <text x="88" y="172" textAnchor="middle" className={soft}>
        Test payment
      </text>
      <rect x="176" y="26" width="168" height="168" rx="14" className={card} strokeWidth="1.5" />
      <text x="260" y="46" textAnchor="middle" className={ink}>
        Zen Chat
      </text>
      <rect x="190" y="58" width="92" height="22" rx="11" className="fill-primary-soft" />
      <text x="236" y="73" textAnchor="middle" className={soft}>
        Hi Meera!
      </text>
      <rect x="222" y="88" width="108" height="86" rx="12" className="fill-primary" />
      <rect x="230" y="96" width="92" height="50" rx="8" className="fill-primary-soft" />
      <circle cx="252" cy="114" r="8" className="fill-warning" />
      <path d="M230 146 l24 -22 l16 14 l14 -12 l38 20 z" className="fill-primary-light" />
      <text x="276" y="166" textAnchor="middle" className={onPrimary}>
        Style reference
      </text>
      <Lock x={186} y={168} />
    </Scene>
  );
}

function Visit() {
  return (
    <Scene label="A row of four steps: I'm here, Checked in, Service done, Billed. Below it an invoice with a padlock, because a paid invoice cannot be edited.">
      {['I am here', 'Check-in', 'Service', 'Billed'].map((t, i) => (
        <g key={t}>
          <circle
            cx={52 + i * 86}
            cy="48"
            r="18"
            className={i < 3 ? 'fill-primary' : 'fill-success'}
          />
          <text x={52 + i * 86} y="53" textAnchor="middle" className={onPrimary}>
            {i + 1}
          </text>
          <text x={52 + i * 86} y="84" textAnchor="middle" className={soft}>
            {t}
          </text>
          {i < 3 && (
            <path
              d={`M${74 + i * 86} 48 h46`}
              strokeWidth="2.5"
              className="zen-flow-line stroke-primary"
            />
          )}
        </g>
      ))}
      <rect x="84" y="100" width="192" height="104" rx="12" className={card} strokeWidth="1.5" />
      <text x="104" y="124" className={ink}>
        Invoice
      </text>
      <rect x="104" y="134" width="108" height="8" rx="4" className="fill-primary-soft" />
      <rect x="104" y="150" width="84" height="8" rx="4" className="fill-primary-soft" />
      <rect x="104" y="166" width="96" height="8" rx="4" className="fill-primary-soft" />
      <text x="104" y="192" className={soft}>
        GST, tip, paid
      </text>
      <Lock x={236} y={160} />
      <text x="244" y="130" textAnchor="middle" className={soft}>
        locked
      </text>
    </Scene>
  );
}

function Rating() {
  return (
    <Scene label="Five stars from Priya, with a padlock: a rating cannot be changed. An arrow leads to Meera's pay, where a rating of 4.5 or more multiplies per-service pay by 1.20.">
      <Person x={52} y={60} initial="P" name="Priya" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d="M0 -13 L4 -4 L14 -4 L6 2 L9 12 L0 6 L-9 12 L-6 2 L-14 -4 L-4 -4 Z"
          transform={`translate(${112 + i * 34} 70)`}
          className="fill-warning"
        />
      ))}
      <Lock x={256} y={52} />
      <text x="190" y="108" textAnchor="middle" className={soft}>
        five stars, saved once
      </text>
      <path
        d="M190 118 v28"
        strokeWidth="2.5"
        className="zen-flow-line stroke-primary"
        fill="none"
      />
      <rect
        x="60"
        y="150"
        width="240"
        height="52"
        rx="14"
        className="fill-surface stroke-primary"
      />
      <Person x={92} y={160} initial="M" />
      <text x="124" y="172" className={ink}>
        Meera's pay
      </text>
      <rect x="124" y="180" width="164" height="16" rx="8" className="fill-success" />
      <text x="206" y="192" textAnchor="middle" className={onPrimary}>
        4.5 or more: x1.20
      </text>
    </Scene>
  );
}

function Dashboard() {
  const bars = [34, 52, 44, 70, 62, 88, 76];
  const heat = [0.2, 0.35, 0.6, 0.9, 0.7, 0.4, 0.25];
  return (
    <Scene label="Suresh's dashboard: revenue bars, a busiest-hours heat strip, the payroll steps Draft, Approved, Paid, and the start of the audit log.">
      <Person x={44} y={36} initial="S" name="Suresh" />
      <rect x="86" y="18" width="150" height="104" rx="12" className={card} strokeWidth="1.5" />
      <text x="100" y="38" className={ink}>
        Revenue
      </text>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={100 + i * 19}
          y={112 - h * 0.7}
          width="13"
          height={h * 0.7}
          rx="3"
          className="fill-primary"
        />
      ))}
      <rect x="248" y="18" width="98" height="104" rx="12" className={card} strokeWidth="1.5" />
      <text x="262" y="38" className={ink}>
        Busy hours
      </text>
      {[0, 1, 2, 3].map((r) =>
        heat.map((o, c) => (
          <rect
            key={`${r}-${c}`}
            x={260 + c * 11}
            y={50 + r * 16}
            width="9"
            height="12"
            rx="2"
            className="fill-primary"
            opacity={Math.min(1, Math.max(0.12, o * (1 - r * 0.18)))}
          />
        )),
      )}
      {['Draft', 'Approved', 'Paid'].map((t, i) => (
        <g key={t}>
          <rect
            x={18 + i * 112}
            y="136"
            width="96"
            height="26"
            rx="13"
            className={i === 2 ? 'fill-success' : 'fill-surface stroke-primary'}
          />
          <text x={66 + i * 112} y="153" textAnchor="middle" className={i === 2 ? onPrimary : ink}>
            {t}
          </text>
        </g>
      ))}
      <rect x="18" y="174" width="328" height="34" rx="10" className={card} strokeWidth="1.5" />
      <text x="32" y="195" className={soft}>
        Audit log: sign-in, refund approved, payroll paid
      </text>
    </Scene>
  );
}

const SCENES: Record<StoryVisual, () => JSX.Element> = {
  request: Request,
  approval: Approval,
  twist: Twist,
  pay: Pay,
  visit: Visit,
  rating: Rating,
  dashboard: Dashboard,
};

export function StoryScene({ visual }: { visual: StoryVisual }) {
  const Scene = SCENES[visual];
  return <Scene />;
}
