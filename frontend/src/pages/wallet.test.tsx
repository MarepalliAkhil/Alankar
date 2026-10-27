import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as bookingApi from '../api/booking';
import * as customersApi from '../api/customers';
import * as posApi from '../api/pos';
import * as publicApi from '../api/public';
import * as walletApi from '../api/wallet';
import * as workApi from '../api/work';
import * as adminApi from '../api/admin';
import { haircut, site } from '../test/fixtures';
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
vi.mock('../api/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/booking')>()),
  getBookingOptions: vi.fn(),
  getPayment: vi.fn(),
  payAppointment: vi.fn(),
}));
vi.mock('../api/customers', () => ({ searchCustomers: vi.fn() }));
vi.mock('../api/admin', () => ({ listAdminServices: vi.fn() }));
vi.mock('../api/pos', () => ({
  getQueue: vi.fn(),
  getVisitContext: vi.fn(),
  getQuote: vi.fn(),
  checkout: vi.fn(),
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  listPendingRefunds: vi.fn(),
  getCashSummary: vi.fn(),
  getInventory: vi.fn(),
}));
vi.mock('../api/wallet', () => ({
  getMyWallet: vi.fn(),
  getMyCoupons: vi.fn(),
  buyPackage: vi.fn(),
  joinMembership: vi.fn(),
  renewMembership: vi.fn(),
  cancelMembership: vi.fn(),
  buyGiftCard: vi.fn(),
  checkMyGiftCard: vi.fn(),
  listMyWaitlist: vi.fn(),
  joinWaitlist: vi.fn(),
  leaveWaitlist: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  getDeskCatalogue: vi.fn(),
  getDeskCustomerWallet: vi.fn(),
  sell: vi.fn(),
  checkDeskGiftCard: vi.fn(),
  listPackages: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  listPurchases: vi.fn(),
  refundPackage: vi.fn(),
  restorePackageUse: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  listMembers: vi.fn(),
  restoreMembershipUse: vi.fn(),
  listGiftCards: vi.fn(),
  getGiftCard: vi.fn(),
  voidGiftCard: vi.fn(),
  listSales: vi.fn(),
  listAdminWaitlist: vi.fn(),
  adminCancelWaitlist: vi.fn(),
}));

const pack: walletApi.PackageRow = {
  id: 'pk1',
  name: 'Cut x3',
  description: '',
  price: '750.00',
  validity_days: 90,
  is_active: true,
  sort_order: 0,
  items: [{ service: 's1', service_name: 'Haircut', quantity: 3, list_price: '300.00' }],
  sold: 2,
};
const plan: walletApi.PlanRow = {
  id: 'pl1',
  name: 'Gold',
  description: '',
  price: '1000.00',
  period_months: 1,
  discount_percent: '10.00',
  applies_to_products: false,
  included_sessions: 1,
  included_services: [{ id: 's1', name: 'Haircut' }],
  rules: '',
  is_active: true,
  sort_order: 0,
  members: 4,
};
const card: walletApi.GiftCardRow = {
  id: 'g1',
  last4: 'ABCD',
  masked: '•••• ABCD',
  initial_amount: '1000.00',
  balance: '700.00',
  usable_balance: '700.00',
  status: 'active',
  expired: false,
  expires_at: '2027-10-01T00:00:00Z',
  issued_at: '2026-10-01T00:00:00Z',
  recipient_name: '',
  buyer_name: 'Priya',
  sale_number: 'SAL-2026-00001',
  channel: 'online',
};
const wallet: walletApi.MyWallet = {
  packages: [],
  membership: null,
  gift_cards: [card],
  sessions_total: 0,
  catalogue: { packages: [pack], plans: [plan] },
};
const purchase: walletApi.PurchaseRow = {
  id: 'pu1',
  name: 'Cut x3',
  price_paid: '750.00',
  purchased_at: '2026-10-20T10:00:00Z',
  expires_at: '2027-01-20T10:00:00Z',
  sale_number: 'SAL-2026-00002',
  customer_name: 'Priya Customer',
  customer_id: 'c1',
  credits: [
    { id: 'cr1', service_name: 'Haircut', quantity: 3, remaining: 2, unit_value: '250.00' },
  ],
  remaining: 2,
  refunded: '0.00',
  ledger: [
    {
      id: 'e1',
      service_name: 'Haircut',
      delta: -1,
      reason: 'used',
      reason_label: 'Used',
      invoice: 'INV-2026-00007',
      note: '',
      created_at: '2026-10-22T10:00:00Z',
      actor: 'Rita',
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(walletApi.getMyWallet).mockResolvedValue(wallet);
  vi.mocked(walletApi.listMyWaitlist).mockResolvedValue([]);
  vi.mocked(walletApi.getMyCoupons).mockResolvedValue([]);
  vi.mocked(walletApi.getDeskCatalogue).mockResolvedValue(wallet.catalogue);
});

describe('customer wallet', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
  });

  it('lists gift cards by their last four characters only', async () => {
    renderAt('/customer/wallet');
    expect(await screen.findByText('•••• ABCD')).toBeInTheDocument();
    expect(screen.getByText(/700\.00 to spend/)).toBeInTheDocument();
  });

  it('buys a gift card, shows the code once and asks to keep it safe', async () => {
    vi.mocked(walletApi.buyGiftCard).mockResolvedValue({
      card: { ...card, id: 'g2', last4: 'WXYZ', masked: '•••• WXYZ' },
      code: 'ABCDE-FGHJK-LMNPQ-RSTUV',
    });
    const user = userEvent.setup();
    renderAt('/customer/wallet');
    await user.click(await screen.findByRole('button', { name: /Buy a gift card/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy a gift card' });
    await user.type(within(dialog).getByLabelText(/Recipient's name/), 'Meera');
    await user.type(within(dialog).getByLabelText(/Recipient's email/), 'meera@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^Pay/ }));
    await waitFor(() => expect(walletApi.buyGiftCard).toHaveBeenCalled());
    expect(vi.mocked(walletApi.buyGiftCard).mock.calls[0][0]).toMatchObject({
      amount: '1000',
      recipient_name: 'Meera',
      recipient_email: 'meera@example.com',
      outcome: 'success',
    });
    expect(await screen.findByTestId('gift-code')).toHaveTextContent('ABCDE-FGHJK-LMNPQ-RSTUV');
    await userEvent.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.queryByTestId('gift-code')).not.toBeInTheDocument();
  });

  it('refuses a gift card amount outside the allowed range without calling the server', async () => {
    const user = userEvent.setup();
    renderAt('/customer/wallet');
    await user.click(await screen.findByRole('button', { name: /Buy a gift card/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy a gift card' });
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '50');
    await user.click(within(dialog).getByRole('button', { name: /^Pay/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/₹100 to ₹50,000/);
    expect(walletApi.buyGiftCard).not.toHaveBeenCalled();
  });

  it('buys a package and reports a declined payment honestly', async () => {
    vi.mocked(walletApi.buyPackage).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 402, data: { detail: 'The payment was declined. No money was taken.' } },
    });
    vi.mocked(walletApi.buyPackage).mockResolvedValueOnce(purchase);
    const user = userEvent.setup();
    renderAt('/customer/wallet');
    const section = await screen.findByRole('region', { name: 'Packages' });
    await user.click(within(section).getByRole('button', { name: 'Simulate failed payment' }));
    expect(await screen.findByText(/No money was taken/)).toBeInTheDocument();
    expect(vi.mocked(walletApi.buyPackage).mock.calls[0]).toEqual(['pk1', 'fail']);
  });

  it('joins a membership', async () => {
    vi.mocked(walletApi.joinMembership).mockResolvedValue({} as walletApi.MembershipRow);
    const user = userEvent.setup();
    renderAt('/customer/wallet');
    await user.click(await screen.findByRole('button', { name: /Join for/ }));
    await waitFor(() =>
      expect(vi.mocked(walletApi.joinMembership).mock.calls[0]).toEqual(['pl1', 'success']),
    );
  });

  it('checks a gift card code and shows a calm error for a wrong one', async () => {
    vi.mocked(walletApi.checkMyGiftCard).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'That gift card code is not valid.' } },
    });
    const user = userEvent.setup();
    renderAt('/customer/wallet');
    await user.type(await screen.findByLabelText('Check a gift card balance'), 'WRONG');
    await user.click(screen.getByRole('button', { name: 'Check balance' }));
    expect(await screen.findByText('That gift card code is not valid.')).toBeInTheDocument();
  });

  it('shows only my private coupons, or a calm empty message', async () => {
    renderAt('/customer/wallet');
    expect(await screen.findByText('No coupons right now')).toBeInTheDocument();
  });

  it('lists a private coupon with its code and state', async () => {
    vi.mocked(walletApi.getMyCoupons).mockResolvedValue([
      {
        id: 'p1',
        code: 'VIP-AB12CD34',
        name: 'Thank you',
        description: 'Rs. 100 off.',
        ends_on: '2026-12-31',
        state: 'ready',
      },
    ]);
    renderAt('/customer/wallet');
    expect(await screen.findByText('VIP-AB12CD34')).toBeInTheDocument();
    expect(screen.getByText('Ready to use')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    vi.mocked(walletApi.getMyWallet).mockRejectedValueOnce(new Error('boom'));
    renderAt('/customer/wallet');
    expect(await screen.findByText(/couldn't load your wallet/)).toBeInTheDocument();
  });
});

describe('customer waitlist', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
  });
  const offered: walletApi.WaitlistRow = {
    id: 'w1',
    service: 's1',
    service_name: 'Haircut',
    variant: null,
    variant_label: '',
    stylist: null,
    stylist_name: 'Any stylist',
    window_start: '2026-10-30T04:00:00Z',
    window_end: '2026-10-30T11:00:00Z',
    note: '',
    status: 'offered',
    status_label: 'Offered',
    created_at: '2026-10-27T10:00:00Z',
    appointment: null,
    offer: {
      id: 'o1',
      start: '2026-10-30T05:30:00Z',
      end: '2026-10-30T06:00:00Z',
      expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      stylist_name: 'Asha',
    },
  };

  it('shows an open offer with the time left and takes the slot', async () => {
    vi.mocked(walletApi.listMyWaitlist).mockResolvedValue([offered]);
    vi.mocked(walletApi.acceptOffer).mockResolvedValue({
      appointment: 'a1',
      status: 'awaiting_payment',
    });
    vi.mocked(bookingApi.getBookingOptions).mockResolvedValue({
      stylists: [],
    } as unknown as Awaited<ReturnType<typeof bookingApi.getBookingOptions>>);
    const user = userEvent.setup();
    renderAt('/customer/waitlist');
    expect(await screen.findByText(/Held for you for/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take this slot' }));
    await waitFor(() => expect(walletApi.acceptOffer).toHaveBeenCalledWith('o1'));
  });

  it('declines an offer', async () => {
    vi.mocked(walletApi.listMyWaitlist).mockResolvedValue([offered]);
    vi.mocked(walletApi.declineOffer).mockResolvedValue();
    const user = userEvent.setup();
    renderAt('/customer/waitlist');
    await user.click(await screen.findByRole('button', { name: 'No thanks' }));
    await waitFor(() => expect(walletApi.declineOffer).toHaveBeenCalledWith('o1'));
  });

  it('joins the waitlist only with a service and a sensible window', async () => {
    vi.mocked(bookingApi.getBookingOptions).mockResolvedValue({
      stylists: [{ id: 'st1', display_name: 'Asha', title: '', photo_url: '' }],
    } as unknown as Awaited<ReturnType<typeof bookingApi.getBookingOptions>>);
    vi.mocked(walletApi.joinWaitlist).mockResolvedValue({
      ...offered,
      status: 'waiting',
      offer: null,
    });
    const user = userEvent.setup();
    renderAt('/customer/waitlist');
    await user.click(await screen.findByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByText('Choose a service.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Service'), haircut.id);
    await user.type(screen.getByLabelText('Free from'), '2026-10-30T09:00');
    await user.type(screen.getByLabelText('Free until'), '2026-10-30T08:00');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByText('The end must be after the start.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Free until'));
    await user.type(screen.getByLabelText('Free until'), '2026-10-30T17:00');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    await waitFor(() => expect(walletApi.joinWaitlist).toHaveBeenCalled());
    expect(vi.mocked(walletApi.joinWaitlist).mock.calls[0][0]).toMatchObject({
      service: haircut.id,
      window_start: expect.stringContaining('2026-10-30T09:00'),
    });
  });

  it('is not reachable by staff', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    renderAt('/customer/waitlist');
    await waitFor(() => expect(screen.queryByText('My requests')).not.toBeInTheDocument());
  });
});

describe('admin: packages, gift cards and waitlist', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    vi.mocked(walletApi.listPackages).mockResolvedValue([pack]);
    vi.mocked(walletApi.listPlans).mockResolvedValue([plan]);
    vi.mocked(walletApi.listPurchases).mockResolvedValue([purchase]);
    vi.mocked(walletApi.listMembers).mockResolvedValue([]);
    vi.mocked(walletApi.listSales).mockResolvedValue([]);
    vi.mocked(walletApi.listGiftCards).mockResolvedValue([card]);
    vi.mocked(walletApi.listAdminWaitlist).mockResolvedValue([]);
    vi.mocked(adminApi.listAdminServices).mockResolvedValue([
      { id: 's1', name: 'Haircut', is_active: true } as unknown as adminApi.AdminService,
    ]);
  });

  it('lists packages with how many were sold and creates one', async () => {
    vi.mocked(walletApi.createPackage).mockResolvedValue(pack);
    const user = userEvent.setup();
    renderAt('/packages');
    expect(await screen.findByText('Cut x3')).toBeInTheDocument();
    expect(screen.getByText(/sold 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /New package/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New package' });
    await user.click(within(dialog).getByRole('button', { name: 'Save package' }));
    expect(await within(dialog).findByText('Give the package a name.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'Facial x5');
    await user.type(within(dialog).getByLabelText(/Price/), '3000');
    await user.selectOptions(within(dialog).getByLabelText('Service 1'), 's1');
    await user.clear(within(dialog).getByLabelText('Sessions'));
    await user.type(within(dialog).getByLabelText('Sessions'), '5');
    await user.click(within(dialog).getByRole('button', { name: 'Save package' }));
    await waitFor(() => expect(walletApi.createPackage).toHaveBeenCalled());
    expect(vi.mocked(walletApi.createPackage).mock.calls[0][0]).toMatchObject({
      name: 'Facial x5',
      price: '3000',
      items: [{ service: 's1', quantity: 5 }],
    });
  });

  it('refunds unused sessions only with a reason', async () => {
    vi.mocked(walletApi.refundPackage).mockResolvedValue({});
    const user = userEvent.setup();
    renderAt('/packages');
    await user.click(await screen.findByRole('tab', { name: 'Packages sold' }));
    await user.click(await screen.findByRole('button', { name: 'Refund unused sessions' }));
    const dialog = await screen.findByRole('dialog', { name: /Refund Cut x3/ });
    await user.click(within(dialog).getByRole('button', { name: 'Refund' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/short reason/);
    expect(walletApi.refundPackage).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Reason'), 'moved away');
    await user.click(within(dialog).getByRole('button', { name: 'Refund' }));
    await waitFor(() =>
      expect(walletApi.refundPackage).toHaveBeenCalledWith('pu1', 'cash', 'moved away'),
    );
  });

  it('puts a used session back from the history', async () => {
    vi.mocked(walletApi.restorePackageUse).mockResolvedValue({});
    const user = userEvent.setup();
    renderAt('/packages');
    await user.click(await screen.findByRole('tab', { name: 'Packages sold' }));
    await user.click(await screen.findByRole('button', { name: 'Put back' }));
    const dialog = await screen.findByRole('dialog', { name: 'Put a session back' });
    await user.type(within(dialog).getByLabelText('Reason'), 'billed by mistake');
    await user.click(within(dialog).getByRole('button', { name: 'Put back' }));
    await waitFor(() =>
      expect(walletApi.restorePackageUse).toHaveBeenCalledWith('e1', 'billed by mistake'),
    );
  });

  it('shows gift cards masked and cancels one with a reason', async () => {
    vi.mocked(walletApi.voidGiftCard).mockResolvedValue({});
    const user = userEvent.setup();
    renderAt('/gift-cards');
    expect(await screen.findByText('•••• ABCD')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel card' }));
    const dialog = await screen.findByRole('dialog', { name: /Cancel card/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'lost');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel card' }));
    await waitFor(() => expect(walletApi.voidGiftCard).toHaveBeenCalledWith('g1', 'lost'));
  });

  it('shows an empty waitlist', async () => {
    renderAt('/waitlist');
    expect(await screen.findByText('Nobody here')).toBeInTheDocument();
  });

  it('keeps wallet pages away from the receptionist', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/gift-cards');
    await waitFor(() => expect(screen.queryByText('•••• ABCD')).not.toBeInTheDocument());
    expect(walletApi.listGiftCards).not.toHaveBeenCalled();
  });
});

describe('counter', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    vi.mocked(posApi.getQueue).mockResolvedValue({ ready: [], recent: [] });
    vi.mocked(customersApi.searchCustomers).mockResolvedValue({
      count: 1,
      results: [
        {
          id: 'c1',
          full_name: 'Priya Customer',
          email: 'priya@example.com',
          phone: '',
          has_allergies: false,
          email_verified: true,
          visits: 2,
        },
      ],
    });
  });

  it('sells a gift card at the counter and shows the code once', async () => {
    vi.mocked(walletApi.sell).mockResolvedValue({
      sale: {
        id: 'sa1',
        number: 'SAL-2026-00009',
        kind: 'gift_card',
        kind_label: 'Gift card',
        channel: 'pos',
        method: 'cash',
        amount: '1000.00',
        refunded: '0.00',
        description: 'Gift card',
        customer_name: '',
        created_at: '2026-10-27T10:00:00Z',
      },
      code: 'AAAAA-BBBBB-CCCCC-DDDDD',
    });
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('tab', { name: 'Sell' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sell' }), 'gift_card');
    await user.type(screen.getByLabelText(/Buyer's name/), 'Walk-in');
    await user.click(screen.getByRole('button', { name: 'Take payment and sell' }));
    expect(await screen.findByTestId('gift-code')).toHaveTextContent('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(vi.mocked(walletApi.sell).mock.calls[0][0]).toMatchObject({
      kind: 'gift_card',
      method: 'cash',
      amount: '1000',
      buyer_name: 'Walk-in',
    });
  });

  it('needs a customer before selling a package', async () => {
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('tab', { name: 'Sell' }));
    await user.click(await screen.findByRole('button', { name: 'Take payment and sell' }));
    expect(await screen.findByText('Find and choose the customer first.')).toBeInTheDocument();
    expect(walletApi.sell).not.toHaveBeenCalled();
  });

  it('pays part of a bill with a gift card after checking its balance', async () => {
    const visit = {
      id: 'a1',
      status: 'checked_in',
      status_label: 'Checked in',
      customer_id: 'c1',
      customer_name: 'Priya Customer',
      service_name: 'Haircut',
      variant_label: 'Short',
      stylist_name: 'Asha',
      room_name: 'Chair 1',
      start: '2026-10-28T05:30:00Z',
      price_total: '300.00',
      allergies: '',
      source: 'online',
    } as posApi.VisitCard;
    vi.mocked(posApi.getQueue).mockResolvedValue({ ready: [visit], recent: [] });
    vi.mocked(posApi.getVisitContext).mockResolvedValue({
      visit,
      products: [],
      max_discount_percent: '20.00',
      points_balance: 0,
      loyalty_point_value: '1.00',
    });
    vi.mocked(posApi.getQuote).mockResolvedValue({
      lines: [],
      gross: '300.00',
      discount_amount: '30.00',
      member_discount: '30.00',
      subtotal: '228.81',
      gst_amount: '41.19',
      total: '270.00',
      prepaid: '0.00',
      excess_prepaid: '0.00',
      loyalty_redeemed: 0,
      loyalty_value: '0.00',
      max_redeemable: 0,
      payable_now: '270.00',
      tip: '0.00',
      to_collect: '270.00',
      loyalty_earned: 2,
      points_balance: 0,
      wallet: {
        membership: {
          plan_name: 'Gold',
          discount_percent: '10.00',
          applies_to_products: false,
          sessions_left: 1,
          period_end: '2026-11-20T00:00:00Z',
          status: 'active',
        },
        session_available: true,
        using_session: false,
        packages: [],
        using_package: null,
      },
    });
    vi.mocked(posApi.checkout).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'stop' } },
    });
    vi.mocked(walletApi.checkDeskGiftCard).mockResolvedValue({
      last4: 'ABCD',
      masked: '•••• ABCD',
      balance: '100.00',
      expires_at: '2027-01-01T00:00:00Z',
    });
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('button', { name: 'Bill Priya Customer' }));
    const dialog = await screen.findByRole('dialog', { name: /Bill Priya Customer/ });
    expect(await within(dialog).findByText('Member discount')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Use a free membership session/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Method 1'), 'gift_card');
    await user.type(within(dialog).getByLabelText('Gift card code 1'), 'aaaaa-bbbbb');
    await user.click(within(dialog).getByRole('button', { name: 'Check balance' }));
    expect(await within(dialog).findByText(/•••• ABCD has/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Amount 1'), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Split payment' }));
    await user.type(within(dialog).getByLabelText('Amount 2'), '170');
    await user.click(within(dialog).getByRole('button', { name: 'Complete bill' }));
    await waitFor(() => expect(posApi.checkout).toHaveBeenCalled());
    expect(vi.mocked(posApi.checkout).mock.calls[0][0].payments).toEqual([
      { method: 'gift_card', amount: '100', code: 'aaaaa-bbbbb' },
      { method: 'card', amount: '170' },
    ]);
  });
});

describe('online payment with a gift card', () => {
  it('sends the code and amount with the payment', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    vi.mocked(bookingApi.getPayment).mockResolvedValue({
      state: 'due',
      amount: '300.00',
      expires_at: '2026-10-28T10:00:00Z',
      appointment: {
        id: 'a1',
        service_name: 'Haircut',
        status: 'awaiting_payment',
        start: '2026-10-30T05:30:00Z',
        stylist_name: 'Asha',
      },
    } as unknown as Awaited<ReturnType<typeof bookingApi.getPayment>>);
    vi.mocked(bookingApi.payAppointment).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderAt('/customer/pay/a1?link=tok');
    await user.type(await screen.findByLabelText(/Gift card code/), 'aaaaa-bbbbb');
    await user.type(screen.getByLabelText(/Amount to take/), '100');
    await user.click(screen.getByRole('button', { name: /^Pay/ }));
    await waitFor(() =>
      expect(bookingApi.payAppointment).toHaveBeenCalledWith('a1', 'success', 'tok', {
        code: 'aaaaa-bbbbb',
        amount: '100',
      }),
    );
  });
});
