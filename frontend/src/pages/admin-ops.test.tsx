import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as opsApi from '../api/adminOps';
import { ensureCsrf, getSession } from '../api/auth';
import * as posApi from '../api/pos';
import * as workApi from '../api/work';
import * as publicApi from '../api/public';
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
vi.mock('../api/pos', () => ({
  getQueue: vi.fn(),
  getVisitContext: vi.fn(),
  getQuote: vi.fn(),
  checkout: vi.fn(),
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  requestRefund: vi.fn(),
  listPendingRefunds: vi.fn(),
  decideRefund: vi.fn(),
  getCashSummary: vi.fn(),
  signCashClose: vi.fn(),
  getInventory: vi.fn(),
}));
vi.mock('../api/work', () => ({
  getMyHours: vi.fn(),
  pingActivity: vi.fn(),
}));
vi.mock('../api/adminOps', () => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  moveStock: vi.fn(),
  getLedger: vi.fn(),
  listSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  listCashCloses: vi.fn(),
  reviewCashClose: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

const serum: opsApi.AdminProduct = {
  id: 'p1',
  sku: 'SER-1',
  name: 'Hair serum',
  category: 'Hair',
  unit_price: '590.00',
  gst_percent: '18.00',
  low_stock_level: 5,
  is_active: true,
  description: '',
  sold_online: true,
  stock: 2,
  low: true,
};

const settings: opsApi.BusinessSettings = {
  shop: {
    address: 'MG Road',
    phone: '+91 90000 00000',
    email: 'hello@example.com',
    map_url: '',
    gst_number: '',
  },
  hours: {
    weekly_hours: {
      mon: ['10:00', '20:00'],
      tue: ['10:00', '20:00'],
      wed: ['10:00', '20:00'],
      thu: ['10:00', '20:00'],
      fri: ['10:00', '20:00'],
      sat: ['10:00', '20:00'],
      sun: null,
    },
  },
  booking: { free_cancel_hours: 24, hold_hours: 6, waitlist_offer_minutes: 15 },
  billing: { discount_cap_percent: 20 },
  security: { idle_minutes: 15, late_grace_minutes: 10 },
  rating: {
    min_ratings: 5,
    flag_below: '3.00',
    bands: [
      { min_average: '4.50', multiplier: '1.20' },
      { min_average: '0.00', multiplier: '0.80' },
    ],
  },
  packages: {
    refund_window_days: null,
    cancellation_fee_percent: 0,
    refund_expired_packages: false,
    no_show_consumes_session: true,
  },
};

const close: opsApi.CashCloseRow = {
  id: 'cc1',
  date: '2026-10-26',
  expected_cash: '1000.00',
  expected_card: '0.00',
  expected_upi: '0.00',
  counted_cash: '960.00',
  difference: '-40.00',
  invoice_count: 3,
  note: 'short',
  closed_by: 'Rita Desk',
  closed_at: '2026-10-26T15:00:00Z',
  reviewed: false,
  reviewed_by: '',
  reviewed_at: null,
  review_note: '',
};

function setup(role: 'admin' | 'customer' | 'stylist' | 'receptionist' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(opsApi.listProducts).mockResolvedValue({ low_count: 1, results: [serum] });
  vi.mocked(opsApi.listSuppliers).mockResolvedValue([]);
  vi.mocked(opsApi.getLedger).mockResolvedValue([]);
  vi.mocked(opsApi.getSettings).mockResolvedValue(settings);
  vi.mocked(opsApi.listCashCloses).mockResolvedValue({
    waiting: 1,
    waiting_with_difference: 1,
    results: [close],
  });
  vi.mocked(posApi.getQueue).mockResolvedValue({ ready: [], recent: [] });
  vi.mocked(posApi.listInvoices).mockResolvedValue([]);
  vi.mocked(posApi.listPendingRefunds).mockResolvedValue([]);
}

describe('admin inventory', () => {
  beforeEach(() => setup());

  it('flags low stock and records a received delivery through the ledger', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.moveStock).mockResolvedValue({
      movement: {} as opsApi.Movement,
      product: { ...serum, stock: 12, low: false },
    });
    renderAt('/inventory');
    expect(
      await screen.findByText(/1 product is at or below the low-stock level/),
    ).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Change stock of Hair serum/ }));
    const dialog = await screen.findByRole('dialog', { name: /Change stock: Hair serum/ });
    await user.type(within(dialog).getByLabelText('Units'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Record movement' }));
    await waitFor(() =>
      expect(opsApi.moveStock).toHaveBeenCalledWith('p1', {
        kind: 'receive',
        quantity: 10,
        note: '',
      }),
    );
  });

  it('needs a reason for wastage and for an adjustment', async () => {
    const user = userEvent.setup();
    renderAt('/inventory');
    await user.click(await screen.findByRole('button', { name: /Change stock of Hair serum/ }));
    const dialog = await screen.findByRole('dialog', { name: /Change stock: Hair serum/ });
    await user.selectOptions(within(dialog).getByLabelText('What happened'), 'wastage');
    await user.type(within(dialog).getByLabelText('Units'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Record movement' }));
    expect(await within(dialog).findByText('Give a short reason.')).toBeInTheDocument();
    expect(opsApi.moveStock).not.toHaveBeenCalled();
  });

  it('never offers a stock field when editing a product', async () => {
    const user = userEvent.setup();
    renderAt('/inventory');
    await user.click(await screen.findByRole('button', { name: /Edit Hair serum/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit product' });
    expect(within(dialog).queryByLabelText(/Opening stock/)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^In stock/)).not.toBeInTheDocument();
  });

  it('checks a new product before sending it, with opening stock only on create', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.createProduct).mockResolvedValue(serum);
    renderAt('/inventory');
    await user.click(await screen.findByRole('button', { name: 'Add a product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a product' });
    await user.click(within(dialog).getByRole('button', { name: 'Save product' }));
    expect(
      await within(dialog).findByText('Enter the SKU, name and category.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/SKU/), 'SHM-1');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Shampoo');
    await user.type(within(dialog).getByLabelText(/^Category/), 'Hair');
    await user.type(within(dialog).getByLabelText(/Price incl/), '450');
    await user.clear(within(dialog).getByLabelText('Opening stock'));
    await user.type(within(dialog).getByLabelText('Opening stock'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(opsApi.createProduct).toHaveBeenCalled());
    expect(vi.mocked(opsApi.createProduct).mock.calls[0][0]).toMatchObject({
      sku: 'SHM-1',
      unit_price: '450',
      opening_stock: 8,
    });
  });
});

describe('settings', () => {
  beforeEach(() => setup());

  it('saves booking rules on their own', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue({
      ...settings,
      booking: { free_cancel_hours: 48, hold_hours: 3, waitlist_offer_minutes: 15 },
    });
    renderAt('/settings');
    const cancel = await screen.findByLabelText(/Free cancellation until/);
    await user.clear(cancel);
    await user.type(cancel, '48');
    const hold = screen.getByLabelText(/Payment link stays open/);
    await user.clear(hold);
    await user.type(hold, '3');
    await user.click(screen.getByRole('button', { name: 'Save booking rules' }));
    await waitFor(() =>
      expect(opsApi.saveSettings).toHaveBeenCalledWith({
        booking: { free_cancel_hours: 48, hold_hours: 3, waitlist_offer_minutes: 15 },
      }),
    );
  });

  it('refuses a GST number of the wrong shape and sends the right one in capitals', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue(settings);
    renderAt('/settings');
    const gst = await screen.findByLabelText(/GST number/);
    await user.type(gst, '12345');
    await user.click(screen.getByRole('button', { name: 'Save shop details' }));
    expect(await screen.findByText(/A GST number has 15 characters/)).toBeInTheDocument();
    expect(opsApi.saveSettings).not.toHaveBeenCalled();
    await user.clear(gst);
    await user.type(gst, '37abcde1234f1z5');
    await user.click(screen.getByRole('button', { name: 'Save shop details' }));
    await waitFor(() => expect(opsApi.saveSettings).toHaveBeenCalled());
    expect(vi.mocked(opsApi.saveSettings).mock.calls[0][0].shop?.gst_number).toBe(
      '37ABCDE1234F1Z5',
    );
  });

  it('closes a day in the opening hours', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue(settings);
    renderAt('/settings');
    await user.click(await screen.findByLabelText('Monday open'));
    await user.click(screen.getByRole('button', { name: 'Save opening hours' }));
    await waitFor(() => expect(opsApi.saveSettings).toHaveBeenCalled());
    const sent = vi.mocked(opsApi.saveSettings).mock.calls[0][0].hours?.weekly_hours;
    expect(sent?.mon).toBeNull();
    expect(sent?.tue).toEqual(['10:00', '20:00']);
  });

  it('checks rating bands: highest first and the last must start at 0', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue(settings);
    renderAt('/settings');
    const last = await screen.findByLabelText('Band 2: average from');
    await user.clear(last);
    await user.type(last, '2');
    await user.click(screen.getByRole('button', { name: 'Save rating bands' }));
    expect(await screen.findByText(/last band must start at 0/)).toBeInTheDocument();
    await user.clear(last);
    await user.type(last, '5');
    await user.click(screen.getByRole('button', { name: 'Save rating bands' }));
    expect(await screen.findByText(/highest average down/)).toBeInTheDocument();
    expect(opsApi.saveSettings).not.toHaveBeenCalled();
  });

  it('saves the discount cap and rejects values outside 0 to 100', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue({
      ...settings,
      billing: { discount_cap_percent: 15 },
    });
    renderAt('/settings');
    const cap = await screen.findByLabelText(/Discount cap/);
    expect(cap).toHaveValue('20');
    await user.clear(cap);
    await user.type(cap, '150');
    await user.click(screen.getByRole('button', { name: 'Save billing' }));
    expect(await screen.findByText('Enter a whole number from 0 to 100.')).toBeInTheDocument();
    expect(opsApi.saveSettings).not.toHaveBeenCalled();
    await user.clear(cap);
    await user.type(cap, '15');
    await user.click(screen.getByRole('button', { name: 'Save billing' }));
    await waitFor(() =>
      expect(opsApi.saveSettings).toHaveBeenCalledWith({ billing: { discount_cap_percent: 15 } }),
    );
  });

  it('refuses an idle timeout outside 5 to 120 minutes', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    const idle = await screen.findByLabelText(/idle timeout/);
    await user.clear(idle);
    await user.type(idle, '2');
    await user.click(screen.getByRole('button', { name: 'Save security' }));
    expect(await screen.findByText(/5 to 120/)).toBeInTheDocument();
    expect(opsApi.saveSettings).not.toHaveBeenCalled();
  });

  it('turns on a package refund deadline and saves the cancellation rules', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.saveSettings).mockResolvedValue({
      ...settings,
      packages: {
        refund_window_days: 30,
        cancellation_fee_percent: 10,
        refund_expired_packages: true,
        no_show_consumes_session: false,
      },
    });
    renderAt('/settings');
    await user.click(
      await screen.findByLabelText(
        'Only allow a cancellation request within a deadline after purchase',
      ),
    );
    const windowInput = screen.getByLabelText(/Refund deadline/);
    await user.clear(windowInput);
    await user.type(windowInput, '30');
    const fee = screen.getByLabelText(/Cancellation fee/);
    await user.clear(fee);
    await user.type(fee, '10');
    await user.click(screen.getByLabelText(/refund request on a package that has already expired/));
    await user.click(screen.getByLabelText(/no-show or a late desk-cancellation/));
    await user.click(screen.getByRole('button', { name: 'Save package cancellations' }));
    await waitFor(() =>
      expect(opsApi.saveSettings).toHaveBeenCalledWith({
        packages: {
          refund_window_days: 30,
          cancellation_fee_percent: 10,
          refund_expired_packages: true,
          no_show_consumes_session: false,
        },
      }),
    );
  });

  it('rejects a cancellation fee outside 0 to 100', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    const fee = await screen.findByLabelText(/Cancellation fee/);
    await user.clear(fee);
    await user.type(fee, '150');
    await user.click(screen.getByRole('button', { name: 'Save package cancellations' }));
    expect(
      await screen.findByText('Cancellation fee: a whole number from 0 to 100.'),
    ).toBeInTheDocument();
    expect(opsApi.saveSettings).not.toHaveBeenCalled();
  });
});

describe('refunds and cash closes (admin)', () => {
  beforeEach(() => setup());

  it('lets the admin put stock back and take loyalty points back when approving', async () => {
    const user = userEvent.setup();
    vi.mocked(posApi.listPendingRefunds).mockResolvedValue([
      {
        id: 'r1',
        status: 'pending_approval',
        status_label: 'Waiting for admin',
        amount: '300.00',
        reason: 'returned serum',
        method: '',
        decision_note: '',
        created_at: '',
        processed_at: null,
        customer_name: 'Priya Customer',
        service_name: 'Haircut',
        invoice_number: 'INV-2026-00001',
        requested_by: 'Desk',
        returnable: [{ product: 'p1', name: 'Hair serum', quantity: 2 }],
        loyalty_earned: 6,
        loyalty_redeemed: 0,
      },
    ]);
    vi.mocked(posApi.decideRefund).mockResolvedValue({} as posApi.RefundRow);
    renderAt('/pos');
    await user.click(await screen.findByRole('tab', { name: 'Refunds' }));
    await user.click(await screen.findByRole('button', { name: 'Approve refund' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this refund' });
    await user.type(within(dialog).getByLabelText(/Hair serum: put back on the shelf/), '1');
    await user.click(within(dialog).getByLabelText(/Take back loyalty points/));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() =>
      expect(posApi.decideRefund).toHaveBeenCalledWith('r1', {
        decision: 'approve',
        method: 'cash',
        restock: [{ product: 'p1', quantity: 1 }],
        reverse_loyalty: true,
      }),
    );
  });

  it('shows cash closes and marks one reviewed, asking for a note when cash differs', async () => {
    const user = userEvent.setup();
    vi.mocked(opsApi.reviewCashClose).mockResolvedValue({ ...close, reviewed: true });
    renderAt('/pos');
    await user.click(await screen.findByRole('tab', { name: 'Cash closes' }));
    expect(
      await screen.findByText(/1 waiting for review, 1 with a cash difference/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mark reviewed/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark this close as reviewed' });
    await user.type(within(dialog).getByLabelText(/Note \(required/), 'Paid to supplier');
    await user.click(within(dialog).getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() =>
      expect(opsApi.reviewCashClose).toHaveBeenCalledWith('cc1', 'Paid to supplier'),
    );
  });

  it('shows no Cash closes or Refunds tab to the receptionist', async () => {
    setup('receptionist');
    renderAt('/pos');
    await screen.findByRole('tab', { name: 'Counter' });
    expect(screen.queryByRole('tab', { name: 'Cash closes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Refunds' })).not.toBeInTheDocument();
    expect(opsApi.listCashCloses).not.toHaveBeenCalled();
  });
});

describe.each(['customer', 'stylist', 'receptionist'] as const)('admin pages as %s', (role) => {
  it('keeps /settings out', async () => {
    setup(role);
    renderAt('/settings');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(opsApi.getSettings).not.toHaveBeenCalled();
  });
});

describe.each(['customer', 'stylist'] as const)('admin inventory as %s', (role) => {
  it('keeps /inventory out', async () => {
    setup(role);
    renderAt('/inventory');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(opsApi.listProducts).not.toHaveBeenCalled();
  });
});

describe('inventory as receptionist', () => {
  it('shows the view-only page, never the admin one', async () => {
    setup('receptionist');
    vi.mocked(posApi.getInventory).mockResolvedValue({ low_count: 0, results: [] });
    renderAt('/inventory');
    await waitFor(() => expect(posApi.getInventory).toHaveBeenCalled());
    expect(opsApi.listProducts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add a product' })).not.toBeInTheDocument();
  });
});
