import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/airDesk';
import type { AirStats } from '../../api/airDesk';
import { ToastProvider } from '../../components/ui';
import { routerFuture } from '../../config/router';
import type { Role } from '../../policy/policy';
import { SessionContext } from '../../session/session-context';
import { userFor } from '../../test/session';
import AirActivityPage from './AirActivityPage';
import { funnelSummary, hourlySummary, tableCsv } from './air-charts';

vi.mock('../../api/airDesk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/airDesk')>()),
  getAirStats: vi.fn(),
  getAirActivity: vi.fn(),
  claimNeeds: vi.fn(),
  resolveNeeds: vi.fn(),
  undoAirAction: vi.fn(),
  revealPhone: vi.fn(),
  getAirBriefing: vi.fn(() => new Promise(() => {})),
  getAirSettings: vi.fn(),
  getAirUsage: vi.fn(),
  getAirCover: vi.fn(),
  getAirDeskStatus: vi.fn(),
  updateAirSettings: vi.fn(),
  forceAirCover: vi.fn(),
}));
vi.mock('virtual:photo-manifest', () => ({ default: ['air/air-02-idle.webp'] }));

const kpi = (value: number, previous: number, change_pct: number | null = null) => ({
  value,
  previous,
  change_pct,
});
const col = (key: string, label: string, kind: 'text' | 'number' = 'number') => ({
  key,
  label,
  kind,
});
const hours = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, '0')}:00`,
  booking: h === 10 ? 3 : 0,
  payment: h === 10 ? 1 : 0,
  order: 0,
  handoff: h === 11 ? 1 : 0,
  other: 0,
  total: h === 10 ? 4 : h === 11 ? 1 : 0,
}));

const STATS: AirStats = {
  range: 'since_last',
  range_label: 'Since your last session',
  period: {
    start: '2026-11-08T00:00:00+00:00',
    end: '2026-11-08T08:00:00+00:00',
    previous_start: '2026-11-07T16:00:00+00:00',
    previous_end: '2026-11-08T00:00:00+00:00',
  },
  generated_at: '2026-11-08T08:00:00+00:00',
  counts: { awaiting_stylist: 1 },
  previous_counts: {},
  kpis: {
    conversations: kpi(6, 3, 100),
    booking_requests: kpi(5, 2, 150),
    reception_accepted: kpi(4, 2, 100),
    stylist_accepted: kpi(2, 1, 100),
    declined_or_timed_out: kpi(2, 0),
    links_sent: kpi(2, 1, 100),
    links_paid: kpi(1, 1, 0),
    links_expired: kpi(1, 0),
    confirmed: kpi(1, 1, 0),
    orders: kpi(1, 0),
    handed_off: kpi(1, 0),
    handover_rate: kpi(16.7, 0),
  },
  needs_you: [
    {
      kind: 'awaiting_stylist',
      kind_label: 'Waiting for the stylist',
      ref: 'r1',
      title: "Men's Haircut: waiting for the stylist",
      customer: 'Esha Waiting',
      customer_id: 'c5',
      when: '2026-11-08T07:00:00+00:00',
      link: '/appointments',
      claimed_by: '',
      claimed_at: null,
    },
  ],
  tables: {
    hourly: {
      columns: [col('hour', 'Hour', 'text'), col('booking', 'Bookings'), col('total', 'Total')],
      rows: hours,
      totals: { hour: 'Total', booking: 3, payment: 1, order: 0, handoff: 1, other: 0, total: 5 },
    },
    funnel: {
      columns: [col('step', 'Step', 'text'), col('count', 'Count')],
      rows: [
        { step: 'Booking requests', count: 5 },
        { step: 'Desk side accepted by AIR', count: 5 },
        { step: 'Accepted by the stylist', count: 2 },
        { step: 'Payment link sent', count: 2 },
        { step: 'Paid', count: 1 },
      ],
    },
    lost: {
      columns: [col('step', 'Ended without a booking', 'text'), col('count', 'Count')],
      rows: [
        { step: 'Declined', count: 1 },
        { step: 'Stylist did not answer in time', count: 1 },
        { step: 'Payment link expired', count: 1 },
      ],
    },
    links: {
      columns: [col('status', 'Payment links', 'text'), col('count', 'Count')],
      rows: [
        { status: 'Paid', count: 1 },
        { status: 'Pending', count: 0 },
        { status: 'Expired', count: 1 },
      ],
      totals: { status: 'Sent', count: 2 },
    },
    stylists: {
      columns: [col('name', 'Stylist', 'text'), col('accepted', 'Accepted')],
      rows: [{ name: 'Asha', accepted: 2, declined: 1, timed_out: 1, waiting: 1, total: 5 }],
    },
    conversations: {
      columns: [col('date', 'Day', 'text'), col('chat', 'Chat'), col('rate', 'Handover rate (%)')],
      rows: [
        { date: '2026-11-08', chat: 6, voice: 0, conversations: 6, handed_off: 1, rate: 16.7 },
      ],
    },
    products: {
      columns: [col('name', 'Product', 'text'), col('units', 'Units')],
      rows: [{ name: 'Argan Hair Oil', units: 2, stock_before: 5, stock_after: 3 }],
    },
    product_changes: {
      columns: [col('when', 'When', 'text'), col('product', 'Product', 'text')],
      rows: [
        {
          when: '2026-11-08T07:10:00+00:00',
          product: 'Argan Hair Oil',
          change: 'Placed a product order',
          quantity: 2,
          stock_before: 5,
          stock_after: 3,
          order: 'ORD-1',
        },
      ],
    },
  },
  channels: { chat: 6, voice: 0 },
  customers: [
    {
      customer_id: 'c1',
      name: 'Asha Paid',
      actions: 4,
      bookings: 1,
      orders: 0,
      handed_off: 0,
      last: '2026-11-08T07:00:00+00:00',
      did: ['Sent a booking request (1)'],
    },
  ],
  cover: { active: true, since: '2026-11-08T00:00:00+00:00' },
};

const ROWS = [
  {
    id: 'a1',
    when: '2026-11-08T07:00:00+00:00',
    type: 'booking' as const,
    action: 'Held a time',
    result: 'Done',
    customer: 'Asha Paid',
    customer_id: 'c1',
    phone_masked: '••••••3210',
    link: '',
    link_label: '',
    can_undo: true,
  },
  {
    id: 'a2',
    when: '2026-11-08T07:01:00+00:00',
    type: 'booking' as const,
    action: 'Sent a booking request',
    result: 'Done',
    customer: 'Asha Paid',
    customer_id: 'c1',
    phone_masked: '••••••3210',
    link: '/appointments',
    link_label: 'Booking',
    can_undo: false,
  },
];

function mount(role: Role = 'receptionist') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider
        value={{
          status: 'authenticated',
          user: userFor(role),
          signIn: vi.fn(),
          completeOtp: vi.fn(),
          completeTwoFactor: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter future={routerFuture}>
          <ToastProvider>
            <AirActivityPage />
          </ToastProvider>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getAirStats).mockResolvedValue(STATS);
  vi.mocked(api.getAirActivity).mockResolvedValue(ROWS);
  vi.mocked(api.claimNeeds).mockResolvedValue();
  vi.mocked(api.resolveNeeds).mockResolvedValue();
  vi.mocked(api.undoAirAction).mockResolvedValue();
  vi.mocked(api.revealPhone).mockResolvedValue('9876543210');
});

function adminMocks(coverOn = true) {
  vi.mocked(api.getAirSettings).mockResolvedValue({
    master_enabled: false,
    air_enabled: coverOn,
    presence_minutes: 10,
    stylist_timeout_minutes: 15,
    payment_link_minutes: 45,
    undo_window_minutes: 10,
    daily_request_cap: 200,
    monthly_request_cap: 3000,
    breaker_failures: 5,
    breaker_cooldown_seconds: 300,
    request_timeout_seconds: 10,
    retry_limit: 1,
    max_order_quantity: 5,
    monthly_spend_cap_rupees: '500.00',
    cost_per_request_rupees: '0.50',
    key_configured: false,
    provider: '',
    model: '',
    spend_shutoff_month: '',
    updated_at: '2026-11-08T00:00:00Z',
  });
  vi.mocked(api.getAirUsage).mockResolvedValue({
    today_requests: 0,
    today_cost_rupees: '0',
    month_requests: 0,
    month_cost_rupees: '0',
    daily_request_cap: 200,
    monthly_request_cap: 3000,
    monthly_spend_cap_rupees: '500.00',
    ai_available: false,
    ai_blocked_reason: 'switched_off',
    breaker_open: false,
    breaker_open_until: null,
    cost_is_estimate: true,
    last_30_days_requests: 0,
  });
  vi.mocked(api.getAirCover).mockResolvedValue({
    active: false,
    reason: '',
    force: 'auto',
    force_reason: '',
    forced_at: null,
    since: null,
    receptionist_on_shift: true,
    receptionist_logged_in: true,
    time_zone: 'Asia/Kolkata',
  });
  vi.mocked(api.getAirDeskStatus).mockResolvedValue({
    cover_enabled: coverOn,
    cover_active: false,
    cover_reason: 'receptionist_logged_in',
    cover_reason_text: 'a receptionist is signed in and active at the desk',
    presence_minutes: 10,
    force: 'auto',
    last_sweep_at: null,
    scheduler_stale: coverOn,
    scheduler_stale_minutes: null,
    last_error: '',
    waiting_count: 1,
    waiting: [{ id: 'abcdef12-0000', reason: 'cover_inactive: receptionist_logged_in' }],
  });
}

describe('AIR Activity page', () => {
  it('pins the needs-you list on top and claims an item', async () => {
    const user = userEvent.setup();
    mount();
    const needs = await screen.findByRole('region', { name: /Needs you/ });
    const sections = Array.from(document.querySelectorAll('section'));
    expect(sections.indexOf(needs as HTMLElement)).toBeLessThan(
      sections.indexOf(screen.getByRole('region', { name: 'The numbers' }) as HTMLElement),
    );
    expect(within(needs).getByText(/Esha Waiting/)).toBeTruthy();
    await user.click(within(needs).getByRole('button', { name: 'Claim' }));
    expect(api.claimNeeds).toHaveBeenCalledWith('awaiting_stylist', 'r1');
    await user.click(within(needs).getByRole('button', { name: 'Resolved' }));
    expect(api.resolveNeeds).toHaveBeenCalledWith('awaiting_stylist', 'r1');
  });

  it('shows KPI tiles compared with the period before', async () => {
    mount();
    expect(await screen.findByText('Booking requests taken')).toBeTruthy();
    expect(screen.getByText('Up 150% from 2')).toBeTruthy();
    expect(screen.getByText('16.7%')).toBeTruthy();
  });

  it('gives every chart a text summary and a table with the same totals', async () => {
    mount();
    await screen.findByRole('region', { name: 'Actions by hour' });
    for (const title of [
      'Actions by hour',
      'Booking funnel',
      'Payment links',
      'Stylist responses',
      'Conversations and handover rate (7 days)',
      'Products updated',
    ]) {
      const card = screen.getByRole('region', { name: title });
      expect(within(card).getByRole('table', { name: title })).toBeTruthy();
    }
    expect(hourlySummary(STATS.tables.hourly)).toContain('5 actions in all');
    expect(hourlySummary(STATS.tables.hourly)).toContain('Busiest hour: 10:00 with 4');
    expect(funnelSummary(STATS.tables.funnel, STATS.tables.lost)).toContain(
      'Booking requests: 5; Desk side accepted by AIR: 5; Accepted by the stylist: 2; Payment link sent: 2; Paid: 1',
    );
    const linksTable = within(screen.getByRole('region', { name: 'Payment links' })).getByRole(
      'table',
    );
    expect(within(linksTable).getByText('Sent')).toBeTruthy();
  });

  it('lists the activity with masked phones, reveal on click, filters and Undo', async () => {
    const user = userEvent.setup();
    mount();
    const table = await screen.findByRole('table', { name: 'What AIR did' });
    expect(within(table).queryByText('9876543210')).toBeNull();
    await user.click(within(table).getAllByRole('button', { name: /phone number ending 3210/ })[0]);
    expect(await within(table).findByText('9876543210')).toBeTruthy();
    expect(within(table).getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
    await user.click(within(table).getByRole('button', { name: 'Undo' }));
    expect(api.undoAirAction).toHaveBeenCalledWith('a1');
    await user.selectOptions(screen.getByLabelText('Type'), 'payment');
    await waitFor(() =>
      expect(api.getAirActivity).toHaveBeenLastCalledWith('since_last', {
        type: 'payment',
        customer: '',
      }),
    );
  });

  it('shows the customers and products panels and the cover banner', async () => {
    mount();
    const customers = await screen.findByRole('region', { name: 'Customers panel' });
    expect(within(customers).getByText(/Sent a booking request \(1\)/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Products panel' })).toBeTruthy();
    expect(screen.getByText(/AIR is covering the front desk right now/)).toBeTruthy();
  });

  it('has the AIR settings tab for the admin only', async () => {
    const { unmount } = mount('receptionist');
    await screen.findByRole('region', { name: /Needs you/ });
    expect(screen.queryByRole('tab', { name: 'AIR settings' })).toBeNull();
    unmount();
    adminMocks();
    vi.mocked(api.updateAirSettings).mockImplementation(async (c) => ({
      ...(await api.getAirSettings()),
      ...c,
    }));
    const user = userEvent.setup();
    mount('admin');
    await user.click(await screen.findByRole('tab', { name: 'AIR settings' }));
    const switches = await screen.findByRole('region', { name: 'AIR switches and limits' });
    expect(within(switches).getByText('no')).toBeTruthy(); // key configured: no
    expect(screen.queryByText(/AIR desk cover is OFF, AIR will not act/)).toBeNull();
    const status = await screen.findByRole('region', { name: 'Desk cover status' });
    expect(within(status).getByText(/signed in and active at the desk/)).toBeTruthy();
    expect(within(status).getByText(/scheduler has not run for more than 5 minutes/)).toBeTruthy();
    expect(within(status).getByText(/cover_inactive: receptionist_logged_in/)).toBeTruthy();
    const timeout = screen.getByLabelText('Stylist timeout (minutes)');
    expect((timeout as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('Payment-link expiry (minutes)') as HTMLInputElement).value).toBe(
      '45',
    );
    await user.clear(timeout);
    await user.type(timeout, '20');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    expect(api.updateAirSettings).toHaveBeenCalledWith({ stylist_timeout_minutes: 20 });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('shows a red banner when AIR desk cover is off', async () => {
    adminMocks(false);
    const user = userEvent.setup();
    mount('admin');
    await user.click(await screen.findByRole('tab', { name: 'AIR settings' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/AIR desk cover is OFF, AIR will not act/);
  });

  it('makes a safe CSV of a table', () => {
    const csv = tableCsv({
      columns: [col('name', 'Name', 'text')],
      rows: [{ name: '=cmd' }, { name: 'a,b' }],
    });
    expect(csv.split('\n')).toEqual(['Name', "'=cmd", '"a,b"']);
  });

  it('has no axe violations', async () => {
    const { container } = mount();
    await screen.findByRole('table', { name: 'What AIR did' });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
