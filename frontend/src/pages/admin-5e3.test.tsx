import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as adminOps from '../api/adminOps';
import * as publicApi from '../api/public';
import * as purchasing from '../api/purchasing';
import * as securityApi from '../api/security';
import * as twofactor from '../api/twofactor';
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
vi.mock('../api/security', () => ({
  getAuditLog: vi.fn(),
  downloadAuditCsv: vi.fn(),
  getSecurity: vi.fn(),
  unlockEmail: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  listDataRequests: vi.fn(),
  decideDataRequest: vi.fn(),
}));
vi.mock('../api/twofactor', () => ({
  getTwoFactor: vi.fn(),
  startTwoFactor: vi.fn(),
  confirmTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  newBackupCodes: vi.fn(),
  resetAdminTwoFactor: vi.fn(),
}));
vi.mock('../api/adminOps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/adminOps')>()),
  listProducts: vi.fn(),
  listSuppliers: vi.fn(),
  getLedger: vi.fn(),
}));
vi.mock('../api/purchasing', () => ({
  listPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  sendPurchaseOrder: vi.fn(),
  receivePurchaseOrder: vi.fn(),
  closePurchaseOrder: vi.fn(),
  getSupplierHistory: vi.fn(),
}));

function setup(role: 'admin' | 'receptionist' | 'stylist' | 'customer' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
}

const status = (over: Partial<twofactor.TwoFactorStatus> = {}): twofactor.TwoFactorStatus => ({
  enabled: false,
  backup_codes_left: 0,
  admins: [],
  ...over,
});

describe('two-step sign-in panel', () => {
  beforeEach(() => {
    setup();
    vi.mocked(securityApi.getSecurity).mockResolvedValue({
      failed_7d: 0,
      lockouts_7d: 0,
      top_emails: [],
      recent_failures: [],
      locks: [],
    });
  });

  it('sets it up: shows the QR and key, needs a right code, then shows backup codes once', async () => {
    const user = userEvent.setup();
    vi.mocked(twofactor.getTwoFactor).mockResolvedValue(status());
    vi.mocked(twofactor.startTwoFactor).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/Shop:me@example.com?secret=JBSWY3DPEHPK3PXP',
      qr: ['1010101', '0101010', '1010101', '0101010', '1010101', '0101010', '1010101'],
    });
    vi.mocked(twofactor.confirmTwoFactor).mockResolvedValue({
      backup_codes: ['abcde-fghjk', 'mnpqr-stuvw'],
    });
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Two-step sign-in' }));
    expect(await screen.findByText('Off')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Set up two-step sign-in/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up two-step sign-in' });
    expect(await within(dialog).findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(within(dialog).getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('6-digit code'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(twofactor.confirmTwoFactor).toHaveBeenCalledWith('123456'));
    const codes = await screen.findByRole('dialog', { name: 'Your backup codes' });
    expect(within(codes).getByText('abcde-fghjk')).toBeInTheDocument();
    await user.click(within(codes).getByRole('button', { name: 'I have saved them' }));
    expect(screen.queryByText('abcde-fghjk')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows the message when the code is wrong', async () => {
    const user = userEvent.setup();
    vi.mocked(twofactor.getTwoFactor).mockResolvedValue(status());
    vi.mocked(twofactor.startTwoFactor).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://x',
      qr: ['1'],
    });
    vi.mocked(twofactor.confirmTwoFactor).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { code: ['That code is incorrect or has expired.'] } },
    });
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Two-step sign-in' }));
    await user.click(await screen.findByRole('button', { name: /Set up two-step sign-in/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up two-step sign-in' });
    await user.type(await within(dialog).findByLabelText('6-digit code'), '000000');
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(
      await within(dialog).findByText('That code is incorrect or has expired.'),
    ).toBeInTheDocument();
  });

  it('turns it off only with the password and a code', async () => {
    const user = userEvent.setup();
    vi.mocked(twofactor.getTwoFactor).mockResolvedValue(
      status({ enabled: true, backup_codes_left: 9 }),
    );
    vi.mocked(twofactor.disableTwoFactor).mockResolvedValue();
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Two-step sign-in' }));
    expect(await screen.findByText(/9 backup codes left/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-step sign-in' });
    await user.type(within(dialog).getByLabelText('Password'), 'Strong-Pass-2026!');
    await user.type(within(dialog).getByLabelText('Code from your app'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(twofactor.disableTwoFactor).toHaveBeenCalledWith('Strong-Pass-2026!', '123456'),
    );
  });

  it('lets one admin reset another who lost their phone, with a reason', async () => {
    const user = userEvent.setup();
    vi.mocked(twofactor.getTwoFactor).mockResolvedValue(
      status({
        admins: [
          { id: 'a2', name: 'Meera Rao', email: 'meera@example.com', two_factor: true },
          { id: 'a3', name: 'Dev Shah', email: 'dev@example.com', two_factor: false },
        ],
      }),
    );
    vi.mocked(twofactor.resetAdminTwoFactor).mockResolvedValue();
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Two-step sign-in' }));
    expect(await screen.findByText('Meera Rao')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reset…' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reset…' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Reset two-step sign-in for Meera Rao',
    });
    await user.type(within(dialog).getByLabelText(/Why\?/), 'Lost the phone');
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(twofactor.resetAdminTwoFactor).toHaveBeenCalledWith('a2', 'Lost the phone'),
    );
  });
});

const supplier: adminOps.Supplier = {
  id: 's1',
  name: 'Glow Supplies',
  contact_person: 'Ravi',
  phone: '',
  email: 'ravi@glow.example',
  notes: '',
  is_active: true,
  movement_count: 0,
};
const order = (over: Partial<purchasing.PurchaseOrder> = {}): purchasing.PurchaseOrder => ({
  id: 'o1',
  number: 'PO-2026-0001',
  supplier: 's1',
  supplier_name: 'Glow Supplies',
  status: 'draft',
  status_label: 'Draft',
  expected_on: null,
  notes: '',
  created_at: '2026-10-28T10:00:00Z',
  sent_at: null,
  closed_at: null,
  close_reason: '',
  ordered_value: '2900.00',
  received_value: '0.00',
  units_ordered: 14,
  units_received: 0,
  lines: [
    {
      id: 'l1',
      product: 'p1',
      product_name: 'Hair serum',
      sku: 'SER-1',
      quantity: 10,
      unit_cost: '250.00',
      line_total: '2500.00',
      received: 0,
      outstanding: 10,
    },
  ],
  receipts: [],
  ...over,
});

describe('purchase orders', () => {
  beforeEach(() => {
    setup();
    vi.mocked(adminOps.listSuppliers).mockResolvedValue([supplier]);
    vi.mocked(adminOps.listProducts).mockResolvedValue({
      low_count: 0,
      results: [
        {
          id: 'p1',
          sku: 'SER-1',
          name: 'Hair serum',
          category: 'Hair',
          unit_price: '590.00',
          gst_percent: '18.00',
          low_stock_level: 2,
          is_active: true,
          stock: 5,
          low: false,
        },
      ],
    });
    vi.mocked(purchasing.listPurchaseOrders).mockResolvedValue([order()]);
  });

  async function openTab(user: ReturnType<typeof userEvent.setup>) {
    renderAt('/inventory');
    await user.click(await screen.findByRole('tab', { name: 'Purchase orders' }));
  }

  it('lists orders with their status and progress', async () => {
    const user = userEvent.setup();
    await openTab(user);
    expect(await screen.findByText('PO-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/0 of 14 units received/)).toBeInTheDocument();
  });

  it('creates a draft after checking every line has a product, quantity and cost', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasing.createPurchaseOrder).mockResolvedValue(order());
    vi.mocked(purchasing.getPurchaseOrder).mockResolvedValue(order());
    await openTab(user);
    await user.click(await screen.findByRole('button', { name: /New order/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New purchase order' });
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(within(dialog).getByText('Choose a supplier.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Supplier'), 's1');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(
      within(dialog).getByText('Every line needs a product, a quantity and a cost.'),
    ).toBeInTheDocument();
    expect(purchasing.createPurchaseOrder).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Product 1'), 'p1');
    await user.clear(within(dialog).getByLabelText('Quantity 1'));
    await user.type(within(dialog).getByLabelText('Quantity 1'), '10');
    await user.type(within(dialog).getByLabelText(/Cost each 1/), '250');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(purchasing.createPurchaseOrder).toHaveBeenCalledWith({
        supplier: 's1',
        lines: [{ product: 'p1', quantity: 10, unit_cost: '250' }],
        expected_on: null,
        notes: '',
      }),
    );
  });

  it('sends a draft to the supplier', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasing.getPurchaseOrder).mockResolvedValue(order());
    vi.mocked(purchasing.sendPurchaseOrder).mockResolvedValue(order({ status: 'sent' }));
    await openTab(user);
    await user.click(await screen.findByRole('button', { name: 'Open PO-2026-0001' }));
    await user.click(await screen.findByRole('button', { name: 'Send to supplier' }));
    await waitFor(() => expect(purchasing.sendPurchaseOrder).toHaveBeenCalledWith('o1'));
  });

  it('receives part of an order and shows the server message when too many are entered', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasing.getPurchaseOrder).mockResolvedValue(order({ status: 'sent' }));
    vi.mocked(purchasing.receivePurchaseOrder)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 409, data: { detail: 'Only 10 of Hair serum are still due, not 12.' } },
      })
      .mockResolvedValueOnce(order({ status: 'partly_received' }));
    await openTab(user);
    await user.click(await screen.findByRole('button', { name: 'Open PO-2026-0001' }));
    await user.click(await screen.findByRole('button', { name: 'Receive goods' }));
    await user.type(screen.getByLabelText(/Arrived: Hair serum/), '12');
    await user.click(screen.getByRole('button', { name: 'Add to stock' }));
    expect(
      await screen.findByText('Only 10 of Hair serum are still due, not 12.'),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Arrived: Hair serum/));
    await user.type(screen.getByLabelText(/Arrived: Hair serum/), '6');
    await user.click(screen.getByRole('button', { name: 'Add to stock' }));
    await waitFor(() =>
      expect(purchasing.receivePurchaseOrder).toHaveBeenLastCalledWith(
        'o1',
        [{ line: 'l1', quantity: 6 }],
        '',
      ),
    );
  });

  it('shows a supplier history line when a supplier is chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(purchasing.getSupplierHistory).mockResolvedValue({
      supplier: { id: 's1', name: 'Glow Supplies' },
      orders: [order()],
      summary: {
        orders: 2,
        ordered_value: '5800.00',
        received_value: '4150.00',
        open: 1,
        last_order: '2026-10-28T10:00:00Z',
      },
    });
    await openTab(user);
    await user.selectOptions(await screen.findByLabelText('Supplier'), 's1');
    expect(await screen.findByLabelText('Supplier history')).toHaveTextContent(
      /2 orders, ordered .*5,800\.00, received .*4,150\.00, 1 still open/,
    );
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)(
    'keeps purchase orders away from %s',
    async (role) => {
      setup(role);
      renderAt('/inventory');
      await waitFor(() => expect(screen.queryByText('Purchase orders')).not.toBeInTheDocument());
      expect(purchasing.listPurchaseOrders).not.toHaveBeenCalled();
    },
  );
});
