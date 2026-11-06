import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import { listNotifications } from '../api/notifications';
import * as publicApi from '../api/public';
import * as statsApi from '../api/stats';
import type { Kpi, KpiKey, ShopStats, StatsTable } from '../api/stats';
import { haircut, site } from '../test/fixtures';
import { renderAt } from '../test/render';
import { userFor } from '../test/session';

vi.mock('../api/auth', () => ({
  ensureCsrf: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));
vi.mock('../api/stats', () => ({ getShopStats: vi.fn(), downloadStatsTable: vi.fn() }));
vi.mock('../api/notifications', () => ({
  listNotifications: vi.fn().mockResolvedValue({ unread: 0, results: [] }),
  markNotificationsRead: vi.fn(),
}));
vi.mock('../components/charts/StackedBarView', () => ({
  default: ({ title }: { title: string }) => <div role="img" aria-label={title} />,
}));
vi.mock('../components/charts/HBarView', () => ({
  default: ({ title }: { title: string }) => <div role="img" aria-label={title} />,
}));
vi.mock('../lib/saveBlob', () => ({ saveBlob: vi.fn() }));

const kpi = (value: Kpi['value'], previous: Kpi['previous'], pct: number | null): Kpi => ({
  value,
  previous,
  change_pct: pct,
});
const empty: Kpi = kpi(null, null, null);
const table = (
  columns: StatsTable['columns'],
  rows: StatsTable['rows'],
  extra = {},
): StatsTable => ({
  columns,
  rows,
  ...extra,
});

const kpis = Object.fromEntries(
  (
    [
      'revenue_total',
      'revenue_services',
      'revenue_products',
      'revenue_tips',
      'revenue_packages',
      'revenue_memberships',
      'bills',
      'average_bill',
      'bookings',
      'completed',
      'cancelled',
      'no_show',
      'average_rating',
      'ratings',
      'utilization_pct',
      'new_customers',
      'returning_customers',
      'acceptance_pct',
      'desk_minutes',
      'stylist_minutes',
      'decision_minutes',
    ] as KpiKey[]
  ).map((key) => [key, empty]),
) as Record<KpiKey, Kpi>;

const stats = (over: Partial<Record<KpiKey, Kpi>> = {}, rows = true): ShopStats => ({
  period: {
    preset: '30d',
    from: '2026-03-02',
    to: '2026-03-08',
    previous_from: '2026-02-23',
    previous_to: '2026-03-01',
    days: 7,
  },
  generated_at: '2026-03-08T10:30:00+05:30',
  kpis: {
    ...kpis,
    revenue_total: kpi('6050.00', '500.00', 1110),
    bookings: kpi(7, 10, -30),
    cancelled: kpi(3, 1, 200),
    average_rating: kpi(4.5, null, null),
    ...over,
  },
  details: {
    bookings_total: rows ? 7 : 0,
    requests: {
      requests: 3,
      accepted: 2,
      declined: 1,
      expired: 0,
      open: 0,
      acceptance_pct: 66.7,
      decision_minutes: 30,
      desk_minutes: 20,
      stylist_minutes: 30,
    },
    revenue_extra: {
      bills: 3,
      refunds_paid: '0.00',
      online_orders: 0,
      online_orders_total: '0.00',
    },
    offers: {
      coupons: { uses: 1, given: '100.00' },
      packages: { sold: 1, net: '2500.00', sessions_used: 0 },
      memberships: {
        sold: 1,
        net: '1000.00',
        joined: 0,
        renewed: 0,
        cancelled: 0,
        ended: 0,
        active_now: 0,
      },
    },
  },
  tables: {
    revenue_streams: table(
      [
        { key: 'stream', label: 'Stream', kind: 'text' },
        { key: 'revenue', label: 'Revenue (before GST)', kind: 'money' },
      ],
      rows ? [{ stream: 'Services', revenue: '2200.00' }] : [],
      { totals: { stream: 'Total', revenue: '6050.00' } },
    ),
    bookings_by_status: table(
      [
        { key: 'status', label: 'Status', kind: 'text' },
        { key: 'count', label: 'Bookings', kind: 'number' },
      ],
      rows ? [{ status: 'Completed', count: 3 }] : [],
    ),
    revenue_trend: table(
      [
        { key: 'date', label: 'Day', kind: 'text' },
        { key: 'total', label: 'Total', kind: 'money' },
      ],
      rows
        ? [
            {
              date: '2026-03-02',
              services: '1000',
              products: '0',
              tips: '50',
              packages: '0',
              memberships: '0',
              total: '1050.00',
            },
          ]
        : [],
    ),
    bookings_per_day: table(
      [{ key: 'date', label: 'Day', kind: 'text' }],
      rows ? [{ date: '2026-03-02', total: 2, completed: 1, cancelled: 0, no_show: 0 }] : [],
    ),
    busiest_hours: table(
      [
        { key: 'weekday', label: 'Day', kind: 'text' },
        { key: 'h10', label: '10:00', kind: 'number' },
        { key: 'total', label: 'Total', kind: 'number' },
      ],
      rows ? [{ weekday: 'Monday', h10: 1, total: 1 }] : [],
      {
        hours: ['h10'],
        busiest: rows ? 'Monday 10:00' : null,
        totals: { weekday: 'Total', h10: 1, total: 1 },
      },
    ),
    revenue_by_service: table(
      [
        { key: 'name', label: 'Service', kind: 'text' },
        { key: 'revenue', label: 'Revenue (before GST)', kind: 'money' },
      ],
      rows ? [{ name: 'Haircut', visits: 2, revenue: '1400.00' }] : [],
    ),
    top_stylists: table(
      [
        { key: 'name', label: 'Stylist', kind: 'text' },
        { key: 'revenue', label: 'Revenue (before GST)', kind: 'money' },
      ],
      rows ? [{ name: 'Asha', revenue: '1400.00' }] : [],
    ),
    utilization: table(
      [
        { key: 'name', label: 'Stylist', kind: 'text' },
        { key: 'utilization_pct', label: 'Utilization (%)', kind: 'number' },
      ],
      rows ? [{ name: 'Asha', utilization_pct: 4.5 }] : [],
    ),
    top_products: table(
      [
        { key: 'name', label: 'Product', kind: 'text' },
        { key: 'revenue', label: 'Revenue (before GST)', kind: 'money' },
      ],
      rows ? [{ name: 'Rose Serum', revenue: '200.00' }] : [],
    ),
    low_stock: table(
      [
        { key: 'name', label: 'Product', kind: 'text' },
        { key: 'stock', label: 'In stock', kind: 'number' },
      ],
      rows ? [{ name: 'Low Oil', stock: 3 }] : [],
    ),
    coupons: table(
      [
        { key: 'name', label: 'Coupon', kind: 'text' },
        { key: 'uses', label: 'Times used', kind: 'number' },
      ],
      rows ? [{ name: 'TEN', uses: 1, given: '100.00' }] : [],
    ),
    payroll: table(
      [
        { key: 'month', label: 'Month', kind: 'text' },
        { key: 'status', label: 'Status', kind: 'text' },
      ],
      rows ? [{ month: '2026-03', status: 'Approved' }] : [],
    ),
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor('admin'));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(listNotifications).mockResolvedValue({ unread: 0, results: [] });
});

describe('admin shop statistics dashboard', () => {
  it('shows the numbers with the change from the period before', async () => {
    vi.mocked(statsApi.getShopStats).mockResolvedValue(stats());
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Shop statistics' })).toBeInTheDocument();
    const total = (await screen.findByText('Total revenue')).closest('div') as HTMLElement;
    expect(within(total).getByText('₹6,050')).toBeInTheDocument();
    expect(within(total).getByText('Up 1110% from ₹500')).toBeInTheDocument();
    const bookings = screen.getByText('Bookings', { selector: 'p' }).closest('div') as HTMLElement;
    expect(within(bookings).getByText('Down 30% from 10')).toBeInTheDocument();
    // a missing comparison is said in words, never invented
    const rating = screen.getByText('Average rating').closest('div') as HTMLElement;
    expect(within(rating).getByText('4.5 / 5')).toBeInTheDocument();
    expect(within(rating).getByText('Nothing to compare with')).toBeInTheDocument();
    expect(screen.getByText(/compared with 23 Feb to 1 Mar/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it('shows honest empty states when there is no data', async () => {
    vi.mocked(statsApi.getShopStats).mockResolvedValue(
      stats(
        {
          revenue_total: kpi('0.00', '0.00', null),
          bookings: kpi(0, 0, null),
          average_rating: empty,
        },
        false,
      ),
    );
    renderAt('/dashboard');
    expect(await screen.findByText('No bills or bookings in this range')).toBeInTheDocument();
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.getAllByText('No revenue yet').length).toBeGreaterThan(0);
  });

  it('asks the server again for each date range and checks custom dates', async () => {
    const user = userEvent.setup();
    vi.mocked(statsApi.getShopStats).mockResolvedValue(stats());
    renderAt('/dashboard');
    await screen.findByText('Total revenue');
    expect(statsApi.getShopStats).toHaveBeenLastCalledWith({ preset: '30d' });
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(statsApi.getShopStats).toHaveBeenLastCalledWith({ preset: 'today' }),
    );
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-03-09');
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2026-03-02');
    expect(await screen.findByRole('alert')).toHaveTextContent('start date is after');
  });

  it('downloads a table as CSV', async () => {
    const user = userEvent.setup();
    vi.mocked(statsApi.getShopStats).mockResolvedValue(stats());
    vi.mocked(statsApi.downloadStatsTable).mockResolvedValue(new Blob(['x']));
    renderAt('/dashboard');
    await user.click(
      await screen.findByRole('button', { name: 'Download Revenue by stream as CSV' }),
    );
    await waitFor(() =>
      expect(statsApi.downloadStatsTable).toHaveBeenCalledWith(
        { preset: '30d' },
        'revenue_streams',
      ),
    );
  });

  it('shows an error with a retry when the server fails', async () => {
    vi.mocked(statsApi.getShopStats).mockRejectedValue(new Error('boom'));
    renderAt('/dashboard');
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
  });

  it('is not the receptionist dashboard: the receptionist never calls the statistics', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/dashboard');
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(statsApi.getShopStats).not.toHaveBeenCalled();
  });
});
