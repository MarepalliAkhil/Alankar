import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as ra from '../api/ratingsAdmin';
import * as workApi from '../api/work';
import { site } from '../test/fixtures';
import { renderAt } from '../test/render';
import { userFor } from '../test/session';

vi.mock('../api/auth', () => ({
  ensureCsrf: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  registerCustomer: vi.fn(),
  verifyOtp: vi.fn(),
  resendOtp: vi.fn(),
  needsOtp: (result: object) => 'otp_required' in result,
  needsTwoFactor: (result: object) => 'two_factor_required' in result,
  verifyTwoFactor: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  checkInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));
vi.mock('../api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));
vi.mock('../api/payroll', () => ({ listRuns: () => Promise.resolve([]) }));
vi.mock('../api/work', () => ({ getMyHours: vi.fn(), pingActivity: vi.fn() }));
vi.mock('../api/ratingsAdmin', () => ({
  listRatingSummaries: vi.fn(),
  getStylistRatings: vi.fn(),
  moderateRating: vi.fn(),
  listStylistPay: vi.fn(),
  getStylistPay: vi.fn(),
}));
vi.mock('../components/charts/BarChartView', () => ({
  default: ({ title }: { title: string }) => <div>{`chart: ${title}`}</div>,
}));

function setup(role: 'admin' | 'receptionist' | 'stylist' | 'customer' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
}

const summary: ra.StylistRatingSummary = {
  id: 's1',
  name: 'Asha',
  active: true,
  count: 6,
  average: '4.50',
  trend: [{ month: '2026-10', average: '4.50', count: 6 }],
  direction: 'up',
  under_review: 1,
  excluded: 0,
  needs_attention: false,
};
const rating = (over: Partial<ra.AdminRating> = {}): ra.AdminRating => ({
  id: 'r1',
  stars: 1,
  comment: 'Rude and late',
  tags: ['Late'],
  date: '2026-10-20T10:00:00Z',
  customer: 'Priya Rao',
  service: 'Haircut',
  moderation: 'active',
  moderation_label: 'Counts',
  reason: '',
  moderated_by: '',
  moderated_at: null,
  ...over,
});
const detail = (ratings: ra.AdminRating[]): ra.StylistRatingDetail => ({
  id: 's1',
  name: 'Asha',
  count: 6,
  average: '4.50',
  distribution: { '1': 1, '2': 0, '3': 0, '4': 2, '5': 3 },
  trend: [{ month: '2026-10', average: '4.50', count: 6 }],
  direction: 'up',
  pending: 2,
  ratings,
});

describe('admin ratings', () => {
  beforeEach(() => {
    setup();
    vi.mocked(ra.listRatingSummaries).mockResolvedValue([summary]);
  });

  it('lists each stylist with average, count and trend, and shows comments with customer names', async () => {
    const user = userEvent.setup();
    vi.mocked(ra.getStylistRatings).mockResolvedValue(detail([rating()]));
    renderAt('/ratings');
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument();
    expect(screen.getByText('4.50')).toBeInTheDocument();
    expect(screen.getByText(/6 counting · 1 under review/)).toBeInTheDocument();
    expect(screen.getByText('Trending up')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Comments for Asha' }));
    expect(await screen.findByText('Rude and late')).toBeInTheDocument();
    expect(screen.getByText(/Priya Rao/)).toBeInTheDocument();
    expect(screen.getByText('chart: Average rating by month for Asha')).toBeInTheDocument();
    expect(screen.getByText(/2 visits not rated yet/)).toBeInTheDocument();
  });

  it('puts a rating under review with a reason, and never offers delete', async () => {
    const user = userEvent.setup();
    vi.mocked(ra.getStylistRatings).mockResolvedValue(detail([rating()]));
    vi.mocked(ra.moderateRating).mockResolvedValue({ id: 'r1', moderation: 'under_review' });
    renderAt('/ratings');
    await user.click(await screen.findByRole('button', { name: 'Comments for Asha' }));
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Put under review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Put under review' });
    expect(
      within(dialog).getByText(/never deleted|only sees that a rating is under review/),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Abusive language');
    await user.click(within(dialog).getByRole('button', { name: 'Put under review' }));
    await waitFor(() =>
      expect(ra.moderateRating).toHaveBeenCalledWith('r1', 'flag', 'Abusive language'),
    );
  });

  it('offers to count a held rating again', async () => {
    const user = userEvent.setup();
    vi.mocked(ra.getStylistRatings).mockResolvedValue(
      detail([
        rating({
          moderation: 'under_review',
          moderation_label: 'Under review',
          reason: 'Abusive language',
          moderated_by: 'Admin One',
        }),
      ]),
    );
    renderAt('/ratings');
    await user.click(await screen.findByRole('button', { name: 'Comments for Asha' }));
    expect(await screen.findByText(/Admin One: Abusive language/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put under review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exclude' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Count again' })).toBeInTheDocument();
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)(
    'is not available to the %s role',
    async (role) => {
      setup(role);
      renderAt('/ratings');
      expect(
        await screen.findByText(/not allowed|isn.t available|403|cannot/i),
      ).toBeInTheDocument();
      expect(ra.listRatingSummaries).not.toHaveBeenCalled();
    },
  );
});

const payRow = (over: Partial<ra.PayStylistRow> = {}): ra.PayStylistRow => ({
  id: 's1',
  name: 'Asha',
  active: true,
  invoices: 2,
  rating: {
    count: 6,
    needed: 5,
    enough: true,
    average: '4.60',
    multiplier: '1.20',
    flagged: false,
  },
  tasks_pay: '240.00',
  tips: '40.00',
  total: '280.00',
  waiting_checkout: 0,
  ...over,
});

describe('admin payroll: stylist pay', () => {
  beforeEach(() => {
    setup();
    vi.mocked(ra.listStylistPay).mockResolvedValue({
      month: '2026-10',
      estimated: true,
      rules: { min_ratings: 5, bands: [{ label: '4.5 and above', multiplier: '1.20' }] },
      stylists: [payRow()],
      totals: { tasks: '240.00', tips: '40.00', total: '280.00', invoices: 2 },
      reconciliation: { tips_on_invoices: '40.00', tips_in_pay: '40.00', difference: '0.00' },
    });
  });

  it('shows the totals, the reconciliation line and the breakdown per visit', async () => {
    const user = userEvent.setup();
    vi.mocked(ra.getStylistPay).mockResolvedValue({
      month: '2026-10',
      id: 's1',
      name: 'Asha',
      estimated: true,
      rating: payRow().rating,
      tasks: [
        {
          id: 'a1',
          date: '2026-10-20T10:00:00Z',
          invoice: 'INV-2026-00001',
          customer: 'Priya Rao',
          service: 'Haircut (Short)',
          service_price: '300.00',
          partial: false,
          stars: 5,
          rating_state: 'counted',
          base_payout: '100.00',
          multiplier: '1.20',
          payout: '120.00',
          tip: '40.00',
          total: '160.00',
        },
        {
          id: 'a2',
          date: '2026-10-21T10:00:00Z',
          invoice: 'INV-2026-00002',
          customer: 'Priya Rao',
          service: 'Haircut (Short)',
          service_price: '300.00',
          partial: false,
          stars: 1,
          rating_state: 'held',
          base_payout: '100.00',
          multiplier: '1.20',
          payout: '120.00',
          tip: '0.00',
          total: '120.00',
        },
      ],
      waiting_checkout: [],
      totals: { tasks: '240.00', tips: '40.00', total: '280.00' },
    });
    renderAt('/payroll');
    await user.click(await screen.findByRole('tab', { name: 'Stylist pay estimate' }));
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument();
    expect(screen.getByText(/difference ₹0\.00/)).toBeInTheDocument();
    expect(screen.getByText('Estimated')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Breakdown for Asha' }));
    const table = await screen.findByRole('table', { name: 'Billed visits for Asha' });
    expect(within(table).getByText('INV-2026-00001')).toBeInTheDocument();
    expect(within(table).getByText('Not counted (under review)')).toBeInTheDocument();
    expect(within(table).getAllByText('× 1.20')).toHaveLength(2);
  });

  it('shows "x of y ratings needed" below the minimum', async () => {
    vi.mocked(ra.listStylistPay).mockResolvedValue({
      month: '2026-10',
      estimated: true,
      rules: { min_ratings: 5, bands: [] },
      stylists: [
        payRow({
          rating: {
            count: 2,
            needed: 5,
            enough: false,
            average: '5.00',
            multiplier: '1.00',
            flagged: false,
          },
        }),
      ],
      totals: { tasks: '0.00', tips: '0.00', total: '0.00', invoices: 0 },
      reconciliation: { tips_on_invoices: '0.00', tips_in_pay: '0.00', difference: '0.00' },
    });
    renderAt('/payroll');
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Stylist pay estimate' }));
    expect(await screen.findByText(/2 of 5 ratings needed: × 1\.00/)).toBeInTheDocument();
  });

  it('is not available to other roles', async () => {
    setup('receptionist');
    renderAt('/payroll');
    expect(await screen.findByText(/not allowed|isn.t available|403|cannot/i)).toBeInTheDocument();
    expect(ra.listStylistPay).not.toHaveBeenCalled();
  });
});
