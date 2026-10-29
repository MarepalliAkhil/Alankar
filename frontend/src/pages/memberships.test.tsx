import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as membersApi from '../api/memberships';
import * as publicApi from '../api/public';
import * as walletApi from '../api/wallet';
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
vi.mock('../api/work', () => ({ getMyHours: vi.fn(), pingActivity: vi.fn() }));
vi.mock('../api/memberships', () => ({
  getMyMemberships: vi.fn(),
  listMembers: vi.fn(),
  endMembership: vi.fn(),
}));
vi.mock('../api/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/wallet')>()),
  joinMembership: vi.fn(),
  renewMembership: vi.fn(),
  cancelMembership: vi.fn(),
}));

const gold: walletApi.PlanRow = {
  id: 'pl1',
  name: 'Gold',
  description: 'Our best plan',
  price: '1000.00',
  period_months: 1,
  discount_percent: '10.00',
  applies_to_products: false,
  included_sessions: 1,
  included_services: [{ id: 's1', name: 'Haircut' }],
  rules: '',
  is_active: true,
  sort_order: 0,
};
const membership: walletApi.MembershipRow = {
  id: 'm1',
  plan_name: 'Gold',
  price: '1000.00',
  period_months: 1,
  discount_percent: '10.00',
  applies_to_products: false,
  included_sessions: 1,
  included_services: ['Haircut'],
  sessions_left: 1,
  status: 'active',
  status_label: 'Active',
  started_at: '2026-10-01T00:00:00Z',
  period_end: '2026-11-01T00:00:00Z',
  cancelled_at: null,
  can_renew: true,
  ended_at: null,
  end_reason: '',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
});

describe('customer memberships page', () => {
  beforeEach(() => vi.mocked(getSession).mockResolvedValue(userFor('customer')));

  it('shows the membership, renews it and cancels it after confirming', async () => {
    vi.mocked(membersApi.getMyMemberships).mockResolvedValue({
      current: membership,
      past: [],
      plans: [gold],
    });
    vi.mocked(walletApi.renewMembership).mockResolvedValue(membership);
    vi.mocked(walletApi.cancelMembership).mockResolvedValue({
      ...membership,
      status: 'cancelled',
    });
    const user = userEvent.setup();
    renderAt('/customer/memberships');
    const card = await screen.findByRole('region', { name: 'Your membership' });
    expect(within(card).getByText('10% off services')).toBeInTheDocument();
    expect(within(card).getByText(/1 of 1 included session/)).toBeInTheDocument();
    // no Join while a membership is running
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Renew for ₹1,000.00' }));
    expect(walletApi.renewMembership).toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Cancel membership' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel membership' }));
    await waitFor(() => expect(walletApi.cancelMembership).toHaveBeenCalled());
  });

  it('offers to buy a plan again after one ended, and shows why it ended', async () => {
    vi.mocked(membersApi.getMyMemberships).mockResolvedValue({
      current: null,
      past: [
        {
          ...membership,
          status: 'ended',
          status_label: 'Ended',
          can_renew: false,
          ended_at: '2026-10-20T00:00:00Z',
          end_reason: 'Moved away',
        },
      ],
      plans: [gold],
    });
    vi.mocked(walletApi.joinMembership).mockResolvedValue(membership);
    const user = userEvent.setup();
    renderAt('/customer/memberships');
    expect(await screen.findByText('Your membership has ended')).toBeInTheDocument();
    expect(screen.getByText('Ended by the salon: Moved away')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buy again' }));
    expect(walletApi.joinMembership).toHaveBeenCalledWith('pl1');
  });
});

describe('staff members list', () => {
  const member: membersApi.MemberRow = {
    ...membership,
    customer_name: 'Priya Customer',
    customer_id: 'c1',
    customer_email: 'priya@example.com',
    can_end: true,
  };

  it('the admin filters and ends a membership with a reason', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    vi.mocked(membersApi.listMembers).mockResolvedValue({
      members: [member],
      counts: { active: 1, cancelled: 0, ended: 0 },
      plans: ['Gold'],
    });
    vi.mocked(membersApi.endMembership).mockResolvedValue({ ...member, status: 'ended' });
    const user = userEvent.setup();
    renderAt('/memberships');
    expect(await screen.findByText('1 active')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ended' }));
    await waitFor(() =>
      expect(membersApi.listMembers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ended' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(await screen.findByRole('button', { name: 'End membership' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'End now' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Moved away');
    await user.click(within(dialog).getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(membersApi.endMembership).toHaveBeenCalledWith('m1', 'Moved away'));
  });

  it('the receptionist sees the list without an end button', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    vi.mocked(membersApi.listMembers).mockResolvedValue({
      members: [{ ...member, can_end: false }],
      counts: { active: 1 },
      plans: ['Gold'],
    });
    renderAt('/memberships');
    expect(await screen.findByText('Priya Customer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End membership' })).toBeNull();
  });

  it('stylists cannot open it', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    renderAt('/memberships');
    expect(await screen.findByText(/don.t have access|not allowed|403/i)).toBeInTheDocument();
    expect(membersApi.listMembers).not.toHaveBeenCalled();
  });
});
