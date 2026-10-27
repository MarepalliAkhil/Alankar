import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as posApi from '../api/pos';
import * as publicApi from '../api/public';
import { beard, haircut, site } from '../test/fixtures';
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

const visit: posApi.VisitCard = {
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
};

const serum: posApi.PosProduct = {
  id: 'p1',
  sku: 'SER-1',
  name: 'Hair serum',
  category: 'Hair',
  unit_price: '590.00',
  gst_percent: '18.00',
  stock: 4,
  low_stock_level: 2,
  low: false,
};

const quote: posApi.Quote = {
  lines: [],
  gross: '300.00',
  discount_amount: '0.00',
  subtotal: '254.24',
  gst_amount: '45.76',
  total: '300.00',
  prepaid: '0.00',
  excess_prepaid: '0.00',
  loyalty_redeemed: 0,
  loyalty_value: '0.00',
  max_redeemable: 0,
  payable_now: '300.00',
  tip: '0.00',
  to_collect: '300.00',
  loyalty_earned: 3,
  points_balance: 0,
};

const invoice: posApi.InvoiceDetail = {
  id: 'i1',
  number: 'INV-2026-00001',
  customer_id: 'c1',
  customer_name: 'Priya Customer',
  service_name: 'Haircut',
  issued_at: '2026-10-28T06:00:00Z',
  total: '300.00',
  tip_amount: '0.00',
  refundable: '300.00',
  subtotal: '254.24',
  gst_amount: '45.76',
  prepaid_amount: '0.00',
  balance_paid: '300.00',
  discount_percent: '0.00',
  discount_amount: '0.00',
  discount_reason: '',
  loyalty_redeemed: 0,
  loyalty_earned: 3,
  stylist_name: 'Asha',
  items: [
    {
      kind: 'service',
      description: 'Haircut',
      quantity: 1,
      unit_price: '300.00',
      amount: '300.00',
    },
  ],
  payments: [{ method: 'cash', amount: '300.00', reference: 'CASH-1' }],
  refunds: [],
};

const summary: posApi.CashSummary = {
  date: '2026-10-28',
  methods: {
    cash: { taken: '300.00', refunded: '0.00', expected: '300.00' },
    card: { taken: '0.00', refunded: '0.00', expected: '0.00' },
    upi: { taken: '0.00', refunded: '0.00', expected: '0.00' },
  },
  invoice_count: 1,
  tips: '0.00',
  unbilled_visits: 1,
  closed: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(posApi.getQueue).mockResolvedValue({
    ready: [visit],
    recent: [{ ...invoice }],
  });
  vi.mocked(posApi.getVisitContext).mockResolvedValue({
    visit,
    products: [serum],
    max_discount_percent: '20.00',
    points_balance: 0,
    loyalty_point_value: '1.00',
  });
  vi.mocked(posApi.getQuote).mockResolvedValue(quote);
  vi.mocked(posApi.getInvoice).mockResolvedValue(invoice);
  vi.mocked(posApi.listInvoices).mockResolvedValue([invoice]);
  vi.mocked(posApi.listPendingRefunds).mockResolvedValue([]);
  vi.mocked(posApi.getCashSummary).mockResolvedValue(summary);
  vi.mocked(posApi.getInventory).mockResolvedValue({
    low_count: 1,
    results: [serum, { ...serum, id: 'p2', name: 'Shampoo', sku: 'SH-1', stock: 1, low: true }],
  });
});

describe('POS / Billing', () => {
  it('bills a checked-in visit once the payment matches the amount due', async () => {
    vi.mocked(posApi.checkout).mockResolvedValue(invoice);
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('button', { name: 'Bill Priya Customer' }));
    const dialog = await screen.findByRole('dialog', { name: /Bill Priya Customer/ });
    expect(await within(dialog).findByText('To collect now')).toBeInTheDocument();
    const complete = within(dialog).getByRole('button', { name: 'Complete bill' });
    expect(complete).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Fill remaining' }));
    await waitFor(() => expect(complete).toBeEnabled());
    await user.click(complete);
    await waitFor(() => expect(posApi.checkout).toHaveBeenCalled());
    expect(vi.mocked(posApi.checkout).mock.calls[0][0].payments).toEqual([
      { method: 'cash', amount: '300.00' },
    ]);
    expect(
      await screen.findByRole('dialog', { name: /Invoice INV-2026-00001/ }),
    ).toBeInTheDocument();
  });

  it('shows the server message when the bill is refused', async () => {
    vi.mocked(posApi.getQuote).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'Only 1 of Hair serum in stock.' } },
    });
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('button', { name: 'Bill Priya Customer' }));
    expect(await screen.findByText('Only 1 of Hair serum in stock.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete bill' })).toBeDisabled();
  });

  it('shows an empty counter and an error state with retry', async () => {
    vi.mocked(posApi.getQueue).mockResolvedValueOnce({ ready: [], recent: [] });
    const first = renderAt('/pos');
    expect(await screen.findByText('Nobody is waiting to be billed')).toBeInTheDocument();
    first.unmount();
    vi.mocked(posApi.getQueue).mockRejectedValueOnce(new Error('boom'));
    renderAt('/pos');
    expect(await screen.findByText("We couldn't load the counter.")).toBeInTheDocument();
  });

  it('lets a receptionist ask for a refund but shows no Refunds tab', async () => {
    vi.mocked(posApi.requestRefund).mockResolvedValue({
      id: 'r1',
      status: 'pending_approval',
      status_label: 'Waiting for admin',
      amount: '50.00',
      reason: 'unhappy',
      method: '',
      decision_note: '',
      created_at: '',
      processed_at: null,
      customer_name: 'Priya Customer',
      service_name: 'Haircut',
      invoice_number: invoice.number,
      requested_by: 'Desk',
    });
    const user = userEvent.setup();
    renderAt('/pos');
    expect(await screen.findByRole('tab', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Refunds' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Open INV-2026-00001' }));
    await user.click(await screen.findByRole('button', { name: 'Request refund' }));
    await user.type(screen.getByLabelText(/Refund amount/), '50');
    await user.type(screen.getByLabelText(/Reason/), 'unhappy');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(posApi.requestRefund).toHaveBeenCalledWith('i1', { amount: '50', reason: 'unhappy' }),
    );
  });

  it('gives the admin a Refunds tab to approve or reject', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    vi.mocked(posApi.listPendingRefunds).mockResolvedValue([
      {
        id: 'r1',
        status: 'pending_approval',
        status_label: 'Waiting for admin',
        amount: '50.00',
        reason: 'unhappy',
        method: '',
        decision_note: '',
        created_at: '',
        processed_at: null,
        customer_name: 'Priya Customer',
        service_name: 'Haircut',
        invoice_number: 'INV-2026-00001',
        requested_by: 'Desk',
      },
    ]);
    vi.mocked(posApi.decideRefund).mockResolvedValue({} as posApi.RefundRow);
    const user = userEvent.setup();
    renderAt('/pos');
    await user.click(await screen.findByRole('tab', { name: 'Refunds' }));
    await user.click(await screen.findByRole('button', { name: 'Approve refund' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() =>
      expect(posApi.decideRefund).toHaveBeenCalledWith('r1', {
        decision: 'approve',
        method: 'cash',
      }),
    );
  });

  it('keeps customers and stylists out of POS', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    const first = renderAt('/pos');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    first.unmount();
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    renderAt('/pos');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(posApi.getQueue).not.toHaveBeenCalled();
  });
});

describe('Cash Close', () => {
  it('asks for a note when the count differs, then signs off', async () => {
    vi.mocked(posApi.signCashClose).mockResolvedValue(summary);
    const user = userEvent.setup();
    renderAt('/cash-close');
    expect(await screen.findByText(/checked in but\s+not billed yet/)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/Cash counted/), '290');
    expect(await screen.findByText(/Write a short note to explain it/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Note'), 'short by ten');
    await user.click(screen.getByRole('button', { name: 'Close the day' }));
    await waitFor(() =>
      expect(posApi.signCashClose).toHaveBeenCalledWith({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        counted_cash: '290',
        note: 'short by ten',
      }),
    );
  });

  it('shows a closed day as read only', async () => {
    vi.mocked(posApi.getCashSummary).mockResolvedValue({
      ...summary,
      unbilled_visits: 0,
      closed: {
        expected_cash: '300.00',
        counted_cash: '300.00',
        difference: '0.00',
        note: '',
        closed_by: 'Desk Staff',
        closed_at: '2026-10-28T15:00:00Z',
      },
    });
    renderAt('/cash-close');
    expect(await screen.findByText('Day closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close the day' })).not.toBeInTheDocument();
  });

  it('is not available to the admin or customers', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    const first = renderAt('/cash-close');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    first.unmount();
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    renderAt('/cash-close');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(posApi.getCashSummary).not.toHaveBeenCalled();
  });
});

describe('Inventory (view)', () => {
  it('lists products and flags low stock', async () => {
    renderAt('/inventory');
    expect(await screen.findByText('Hair serum')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText(/1 product is running low/)).toBeInTheDocument();
  });

  it('is hidden from customers and stylists', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    renderAt('/inventory');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(posApi.getInventory).not.toHaveBeenCalled();
  });
});
