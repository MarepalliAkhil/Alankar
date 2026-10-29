import { api } from './client';

/** Task 8.5 part 2: the online shop, delivery addresses and orders. Prices always come from the
 * server; the page only sends product ids and quantities. */

export type Money = string;

export interface ShopProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: Money;
  gst_percent: Money;
  in_stock: boolean;
  low_stock: boolean;
  available: number;
}

export interface DeliveryRules {
  delivery_fee: Money;
  free_delivery_over: Money | null;
  max_quantity: number;
  payment_hold_minutes: number;
}

export interface CartItem {
  product: string;
  quantity: number;
}

export interface QuoteLine {
  product: string;
  name: string;
  unit_price: Money;
  quantity: number;
  amount: Money;
}

export interface Quote {
  lines: QuoteLine[];
  items_total: Money;
  gst_included: Money;
  discount: Money;
  delivery_fee: Money;
  total: Money;
}

export interface AddressInput {
  label?: string;
  full_name: string;
  mobile: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  is_default?: boolean;
}

export interface Address extends AddressInput {
  id: string;
  is_default: boolean;
}

export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'payment_expired';

export interface TimelineStep {
  status: 'placed' | 'packed' | 'shipped' | 'delivered';
  label: string;
  at: string | null;
  done: boolean;
}

export interface OrderEvent {
  status: OrderStatus;
  label: string;
  at: string;
  note: string;
  by?: string;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  status_label: string;
  created_at: string;
  pay_until: string | null;
  items_total: Money;
  gst_included: Money;
  discount: Money;
  delivery_fee: Money;
  total: Money;
  paid: Money;
  refunded: Money;
  tracking_note: string;
  cancel_reason: string;
  lines: QuoteLine[];
  address: Omit<AddressInput, 'label' | 'is_default'>;
  timeline: TimelineStep[];
  events: OrderEvent[];
  actions: string[];
  customer?: { id: string; name: string; email: string };
}

export interface PlaceOrderInput {
  items: CartItem[];
  address_id?: string;
  address?: AddressInput;
  save_address?: boolean;
}

// ---------------------------------------------------------------- customer

export async function getShopProducts(): Promise<{
  products: ShopProduct[];
  delivery: DeliveryRules;
}> {
  const { data } = await api.get('/my/shop/products/');
  return data;
}

export async function quoteCart(items: CartItem[]): Promise<Quote> {
  const { data } = await api.post<Quote>('/my/shop/quote/', { items });
  return data;
}

export async function listAddresses(): Promise<Address[]> {
  const { data } = await api.get<{ addresses: Address[] }>('/my/shop/addresses/');
  return data.addresses;
}

export async function createAddress(input: AddressInput): Promise<Address> {
  const { data } = await api.post<Address>('/my/shop/addresses/', input);
  return data;
}

export async function updateAddress(id: string, input: Partial<AddressInput>): Promise<Address> {
  const { data } = await api.patch<Address>(`/my/shop/addresses/${id}/`, input);
  return data;
}

export async function deleteAddress(id: string): Promise<void> {
  await api.delete(`/my/shop/addresses/${id}/`);
}

export async function listMyOrders(): Promise<Order[]> {
  const { data } = await api.get<{ orders: Order[] }>('/my/orders/');
  return data.orders;
}

export async function getMyOrder(id: string): Promise<Order> {
  const { data } = await api.get<Order>(`/my/orders/${id}/`);
  return data;
}

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const { data } = await api.post<Order>('/my/orders/', input);
  return data;
}

export async function payOrder(id: string, outcome: 'success' | 'fail'): Promise<Order> {
  const { data } = await api.post<Order>(`/my/orders/${id}/pay/`, { outcome });
  return data;
}

export async function cancelMyOrder(id: string, reason: string): Promise<Order> {
  const { data } = await api.post<Order>(`/my/orders/${id}/cancel/`, { reason });
  return data;
}

// ---------------------------------------------------------------- receptionist and admin

export interface OrderFilters {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
}

export async function listOrders(
  filters: OrderFilters,
): Promise<{ orders: Order[]; counts: Record<string, number> }> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const { data } = await api.get('/orders/', { params });
  return data;
}

export async function getOrder(id: string): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${id}/`);
  return data;
}

export async function advanceOrder(
  id: string,
  to: 'packed' | 'shipped' | 'delivered',
  note = '',
): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/advance/`, { to, note });
  return data;
}

export async function cancelOrder(id: string, reason: string): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/cancel/`, { reason });
  return data;
}

/** The field the server named in a 400/409, so the form can show the message next to it. */
export function shopFieldError(error: unknown): { field: string; message: string } | null {
  const data = (error as { response?: { data?: { field?: string; detail?: string } } })?.response
    ?.data;
  if (data && typeof data.field === 'string' && typeof data.detail === 'string') {
    return { field: data.field, message: data.detail };
  }
  return null;
}
