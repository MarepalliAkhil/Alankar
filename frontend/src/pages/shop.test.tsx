import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as shopApi from '../api/shop';
import * as workApi from '../api/work';
import { cart } from '../lib/cart';
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
vi.mock('../api/shop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/shop')>()),
  getShopProducts: vi.fn(),
  quoteCart: vi.fn(),
  listAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  listMyOrders: vi.fn(),
  getMyOrder: vi.fn(),
  placeOrder: vi.fn(),
  payOrder: vi.fn(),
  cancelMyOrder: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  advanceOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

const oil: shopApi.ShopProduct = {
  id: 'p1',
  name: 'Argan Hair Oil',
  category: 'Hair care',
  description: 'Light oil for shine.',
  price: '450.00',
  gst_percent: '18.00',
  in_stock: true,
  low_stock: false,
  available: 10,
};
const mask: shopApi.ShopProduct = {
  ...oil,
  id: 'p2',
  name: 'Clay Face Mask',
  category: 'Skin care',
  price: '300.00',
  low_stock: true,
  available: 2,
};
const gone: shopApi.ShopProduct = { ...oil, id: 'p3', name: 'Sold Out Serum', in_stock: false };
const delivery: shopApi.DeliveryRules = {
  delivery_fee: '49.00',
  free_delivery_over: '999.00',
  max_quantity: 10,
  payment_hold_minutes: 30,
};
const quote: shopApi.Quote = {
  lines: [
    { product: 'p1', name: 'Argan Hair Oil', unit_price: '450.00', quantity: 1, amount: '450.00' },
  ],
  items_total: '450.00',
  gst_included: '68.64',
  discount: '0.00',
  delivery_fee: '49.00',
  total: '499.00',
};
const order: shopApi.Order = {
  id: 'o1',
  number: 'ORD-2026-00001',
  status: 'pending_payment',
  status_label: 'Waiting for payment',
  created_at: '2026-10-29T10:00:00Z',
  pay_until: '2026-10-29T10:30:00Z',
  items_total: '450.00',
  gst_included: '68.64',
  discount: '0.00',
  delivery_fee: '49.00',
  total: '499.00',
  paid: '0.00',
  refunded: '0.00',
  tracking_note: '',
  cancel_reason: '',
  lines: quote.lines,
  address: {
    full_name: 'Priya Customer',
    mobile: '9876543210',
    line1: '12, MG Road',
    line2: '',
    landmark: '',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    pincode: '520010',
  },
  timeline: [
    { status: 'placed', label: 'Placed (paid)', at: null, done: false },
    { status: 'packed', label: 'Packed', at: null, done: false },
    { status: 'shipped', label: 'Out for delivery', at: null, done: false },
    { status: 'delivered', label: 'Delivered', at: null, done: false },
  ],
  events: [
    {
      status: 'pending_payment',
      label: 'Waiting for payment',
      at: '2026-10-29T10:00:00Z',
      note: '',
    },
  ],
  actions: ['pay', 'cancel'],
};
const paid: shopApi.Order = {
  ...order,
  status: 'placed',
  status_label: 'Placed (paid)',
  pay_until: null,
  paid: '499.00',
  timeline: order.timeline.map((s, i) =>
    i === 0 ? { ...s, done: true, at: '2026-10-29T10:05:00Z' } : s,
  ),
  actions: ['cancel'],
};

beforeEach(() => {
  vi.resetAllMocks();
  cart.clear();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(shopApi.getShopProducts).mockResolvedValue({
    products: [oil, mask, gone],
    delivery,
  });
  vi.mocked(shopApi.quoteCart).mockResolvedValue(quote);
  vi.mocked(shopApi.listAddresses).mockResolvedValue([]);
  vi.mocked(shopApi.getMyOrder).mockResolvedValue(order);
  vi.mocked(shopApi.listMyOrders).mockResolvedValue([order]);
});

describe('customer shop', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
  });

  it('lists products with stock badges and prices the cart on the server', async () => {
    const user = userEvent.setup();
    renderAt('/customer/shop');
    const card = await screen.findByRole('listitem', { name: 'Argan Hair Oil' });
    expect(screen.getByText('Only 2 left')).toBeInTheDocument();
    expect(
      within(screen.getByRole('listitem', { name: 'Sold Out Serum' })).getByRole('button', {
        name: /Add to cart/,
      }),
    ).toBeDisabled();
    await user.click(within(card).getByRole('button', { name: /Add to cart/ }));
    await waitFor(() =>
      expect(shopApi.quoteCart).toHaveBeenCalledWith([{ product: 'p1', quantity: 1 }]),
    );
    const panel = screen.getByRole('region', { name: 'Your cart' });
    expect(await within(panel).findByText('₹499.00')).toBeInTheDocument();
    expect(within(panel).getByText(/more for free delivery/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'One more Argan Hair Oil' }));
    await waitFor(() =>
      expect(shopApi.quoteCart).toHaveBeenLastCalledWith([{ product: 'p1', quantity: 2 }]),
    );
  });

  it('checks out to a new address, saves it and opens the order to pay', async () => {
    vi.mocked(shopApi.placeOrder).mockResolvedValue(order);
    cart.add('p1');
    const user = userEvent.setup();
    renderAt('/customer/shop');
    await user.click(await screen.findByRole('button', { name: 'Checkout' }));
    await user.click(await screen.findByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Enter the full name.')).toBeInTheDocument();
    expect(shopApi.placeOrder).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Full name/), 'Priya Customer');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/House, flat and street/), '12, MG Road');
    await user.type(screen.getByLabelText(/^City/), 'Vijayawada');
    await user.type(screen.getByLabelText(/^State/), 'Andhra Pradesh');
    await user.type(screen.getByLabelText(/PIN code/), '520010');
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(shopApi.placeOrder).toHaveBeenCalled());
    expect(vi.mocked(shopApi.placeOrder).mock.calls[0][0]).toMatchObject({
      items: [{ product: 'p1', quantity: 1 }],
      address: { full_name: 'Priya Customer', mobile: '9876543210', pincode: '520010' },
      save_address: true,
    });
    expect(await screen.findByRole('heading', { name: 'ORD-2026-00001' })).toBeInTheDocument();
    expect(cart.get()).toEqual([]);
  });

  it('shows the server’s address problem next to the field it names', async () => {
    vi.mocked(shopApi.listAddresses).mockResolvedValue([]);
    vi.mocked(shopApi.placeOrder).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { detail: 'Enter a 10-digit Indian mobile number.', field: 'mobile' },
      },
    });
    cart.add('p1');
    const user = userEvent.setup();
    renderAt('/customer/shop');
    await user.click(await screen.findByRole('button', { name: 'Checkout' }));
    for (const [label, value] of [
      [/Full name/, 'Priya'],
      [/Mobile number/, '5555555555'],
      [/House, flat and street/, '12, MG Road'],
      [/^City/, 'Vijayawada'],
      [/^State/, 'AP'],
      [/PIN code/, '520010'],
    ] as const) {
      await user.type(await screen.findByLabelText(label), value);
    }
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    const mobile = screen.getByLabelText(/Mobile number/);
    await waitFor(() => expect(mobile).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Enter a 10-digit Indian mobile number.')).toBeInTheDocument();
  });

  it('uses a saved default address without asking again', async () => {
    vi.mocked(shopApi.listAddresses).mockResolvedValue([
      {
        id: 'a1',
        label: 'Home',
        is_default: true,
        ...order.address,
      },
    ]);
    vi.mocked(shopApi.placeOrder).mockResolvedValue(order);
    cart.add('p1');
    const user = userEvent.setup();
    renderAt('/customer/shop');
    await user.click(await screen.findByRole('button', { name: 'Checkout' }));
    expect(await screen.findByRole('radio', { name: /Home/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() =>
      expect(shopApi.placeOrder).toHaveBeenCalledWith({
        items: [{ product: 'p1', quantity: 1 }],
        address_id: 'a1',
      }),
    );
  });

  it('pays for an order and shows the tracking timeline', async () => {
    vi.mocked(shopApi.payOrder).mockResolvedValue(paid);
    const user = userEvent.setup();
    renderAt('/customer/orders/o1');
    await user.click(await screen.findByRole('button', { name: 'Pay ₹499.00' }));
    expect(shopApi.payOrder).toHaveBeenCalledWith('o1', 'success');
    const tracking = await screen.findByRole('list', { name: 'Order tracking' });
    await waitFor(() => expect(within(tracking).getByText(/Placed \(paid\)/)).toBeInTheDocument());
    expect(within(tracking).getByText('(done)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
  });

  it('cancels an order before it is packed', async () => {
    vi.mocked(shopApi.getMyOrder).mockResolvedValue(paid);
    vi.mocked(shopApi.cancelMyOrder).mockResolvedValue({
      ...paid,
      status: 'cancelled',
      status_label: 'Cancelled',
      refunded: '499.00',
      actions: [],
    });
    const user = userEvent.setup();
    renderAt('/customer/orders/o1');
    await user.click(await screen.findByRole('button', { name: 'Cancel this order' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/is refunded/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Changed my mind');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() =>
      expect(shopApi.cancelMyOrder).toHaveBeenCalledWith('o1', 'Changed my mind'),
    );
    expect(await screen.findByText(/was refunded/)).toBeInTheDocument();
  });

  it('lists my orders as cards', async () => {
    renderAt('/customer/orders');
    expect(await screen.findByRole('link', { name: 'ORD-2026-00001' })).toHaveAttribute(
      'href',
      '/customer/orders/o1',
    );
    expect(screen.getByText('Waiting for payment')).toBeInTheDocument();
  });
});

describe('staff orders', () => {
  const staffOrder = {
    ...paid,
    customer: { id: 'c1', name: 'Priya Customer', email: 'priya@example.com' },
    events: [{ ...paid.events[0], by: 'Priya Customer' }],
  };

  it('the receptionist filters, opens an order and marks it packed, with no cancel button', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    vi.mocked(shopApi.listOrders).mockResolvedValue({
      orders: [{ ...staffOrder, actions: ['mark_packed'] }],
      counts: { placed: 1, packed: 0, shipped: 0 },
    });
    vi.mocked(shopApi.getOrder).mockResolvedValue({ ...staffOrder, actions: ['mark_packed'] });
    vi.mocked(shopApi.advanceOrder).mockResolvedValue({
      ...staffOrder,
      status: 'packed',
      status_label: 'Packed',
      actions: ['mark_shipped'],
    });
    const user = userEvent.setup();
    renderAt('/orders');
    expect(await screen.findByText('1 to pack')).toBeInTheDocument();
    expect(shopApi.listOrders).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    await user.click(screen.getByRole('button', { name: 'Delivered' }));
    await waitFor(() =>
      expect(shopApi.listOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'delivered' }),
      ),
    );
    renderAt('/orders/o1');
    await user.click(await screen.findByRole('button', { name: 'Mark packed' }));
    expect(shopApi.advanceOrder).toHaveBeenCalledWith('o1', 'packed', '');
    expect(await screen.findByRole('button', { name: 'Hand to delivery' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel with refund/ })).not.toBeInTheDocument();
  });

  it('the admin cancels with a reason', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    vi.mocked(shopApi.getOrder).mockResolvedValue({
      ...staffOrder,
      actions: ['mark_packed', 'cancel'],
    });
    vi.mocked(shopApi.cancelOrder).mockResolvedValue({
      ...staffOrder,
      status: 'cancelled',
      status_label: 'Cancelled',
      cancel_reason: 'Out of stock at the warehouse',
      actions: [],
    });
    const user = userEvent.setup();
    renderAt('/orders/o1');
    await user.click(await screen.findByRole('button', { name: 'Cancel with refund' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel and refund' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeInTheDocument();
    expect(shopApi.cancelOrder).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Out of stock at the warehouse');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel and refund' }));
    await waitFor(() =>
      expect(shopApi.cancelOrder).toHaveBeenCalledWith('o1', 'Out of stock at the warehouse'),
    );
    expect(await screen.findByText(/Cancelled: Out of stock/)).toBeInTheDocument();
  });

  it('stylists cannot open the orders screen', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    renderAt('/orders');
    expect(await screen.findByText(/don.t have access|not allowed|403/i)).toBeInTheDocument();
    expect(shopApi.listOrders).not.toHaveBeenCalled();
  });
});
