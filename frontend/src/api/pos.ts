import { api } from './client';

export type PayMethod = 'cash' | 'card' | 'upi';

export interface VisitCard {
  id: string;
  status: string;
  status_label: string;
  customer_id: string;
  customer_name: string;
  service_name: string;
  variant_label: string;
  stylist_name: string | null;
  room_name: string | null;
  start: string | null;
  price_total: string;
  allergies: string;
  source: string;
  /** Set once the stylist has completed the visit: what was done and what was removed. */
  completion?: {
    done: string[];
    removed: { label: string; price: string }[];
    billed_amount: string;
    note: string;
  } | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string;
  service_name: string;
  issued_at: string;
  total: string;
  tip_amount: string;
  refundable: string;
  service_changes?: string;
}

export interface RefundRow {
  id: string;
  status: 'pending_approval' | 'processed' | 'rejected';
  status_label: string;
  amount: string;
  reason: string;
  method: string;
  decision_note: string;
  created_at: string;
  processed_at: string | null;
  customer_name: string;
  service_name: string;
  invoice_number: string | null;
  requested_by: string | null;
  /** Products the admin put back on the shelf, and loyalty points taken back (+ given back). */
  restocked?: { product: string; name: string; quantity: number }[];
  loyalty_adjusted?: number;
  invoice_id?: string | null;
  /** What could still go back on the shelf for this invoice. */
  returnable?: Returnable[];
  loyalty_earned?: number;
  loyalty_redeemed?: number;
}

export interface Returnable {
  product: string;
  name: string;
  quantity: number;
}

export interface Reversal {
  restock: { product: string; quantity: number }[];
  reverse_loyalty: boolean;
}

export interface InvoiceDetail extends InvoiceRow {
  subtotal: string;
  gst_amount: string;
  prepaid_amount: string;
  balance_paid: string;
  discount_percent: string;
  discount_amount: string;
  discount_reason: string;
  coupon_code?: string;
  coupon_amount?: string;
  loyalty_redeemed: number;
  loyalty_earned: number;
  returnable?: Returnable[];
  stylist_name: string | null;
  items: {
    kind: 'service' | 'product';
    description: string;
    quantity: number;
    unit_price: string;
    amount: string;
  }[];
  payments: { method: string; amount: string; reference: string }[];
  refunds: RefundRow[];
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_price: string;
  gst_percent: string;
  stock: number;
  low_stock_level: number;
  low: boolean;
}

export interface VisitContext {
  visit: VisitCard;
  products: PosProduct[];
  max_discount_percent: string;
  points_balance: number;
  loyalty_point_value: string;
}

export interface BillInput {
  appointment: string;
  products: { product: string; quantity: number }[];
  discount_percent: string;
  discount_reason: string;
  redeem_points: number;
  /** One coupon code per bill (optional). */
  coupon?: string;
  tip: string;
  payments?: { method: PayMethod | 'gift_card'; amount: string; code?: string }[];
  /** The id of one of the customer's package credits (a session pays for the service). */
  package?: string | null;
  /** Use an included membership session for the service. */
  membership_session?: boolean;
}

export interface QuoteWallet {
  membership: {
    plan_name: string;
    discount_percent: string;
    applies_to_products: boolean;
    sessions_left: number;
    period_end: string;
    status: string;
  } | null;
  session_available: boolean;
  using_session: boolean;
  packages: {
    id: string;
    name: string;
    service_name: string;
    remaining: number;
    unit_value: string;
    expires_at: string;
  }[];
  using_package: string | null;
}

export interface Quote {
  lines: {
    kind: 'service' | 'product';
    description: string;
    quantity: number;
    unit_price: string;
    amount: string;
    discount: string;
    after_discount: string;
    /** Task 8.5 part 4: booked with the visit; stock already held, never billed twice. */
    from_booking?: boolean;
  }[];
  gross: string;
  discount_amount: string;
  coupon_code?: string;
  coupon_amount?: string;
  member_discount?: string;
  credit_amount?: string;
  wallet?: QuoteWallet;
  subtotal: string;
  gst_amount: string;
  total: string;
  prepaid: string;
  excess_prepaid: string;
  loyalty_redeemed: number;
  loyalty_value: string;
  max_redeemable: number;
  payable_now: string;
  tip: string;
  to_collect: string;
  loyalty_earned: number;
  points_balance: number;
}

export async function getQueue(): Promise<{ ready: VisitCard[]; recent: InvoiceRow[] }> {
  const { data } = await api.get('/desk/pos/queue/');
  return data;
}

export async function getVisitContext(id: string): Promise<VisitContext> {
  const { data } = await api.get<VisitContext>(`/desk/pos/visits/${id}/`);
  return data;
}

export async function getQuote(input: BillInput): Promise<Quote> {
  const { data } = await api.post<Quote>('/desk/pos/quote/', { ...input, payments: [] });
  return data;
}

export async function checkout(input: BillInput): Promise<InvoiceDetail> {
  const { data } = await api.post<InvoiceDetail>('/desk/pos/checkout/', input);
  return data;
}

export async function listInvoices(q: string): Promise<InvoiceRow[]> {
  const { data } = await api.get<InvoiceRow[]>('/desk/invoices/', { params: q ? { q } : {} });
  return data;
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const { data } = await api.get<InvoiceDetail>(`/desk/invoices/${id}/`);
  return data;
}

export async function requestRefund(
  invoiceId: string,
  payload: { amount: string; reason: string; method?: PayMethod } & Partial<Reversal>,
): Promise<RefundRow> {
  const { data } = await api.post<RefundRow>(`/desk/invoices/${invoiceId}/refunds/`, payload);
  return data;
}

export async function listPendingRefunds(): Promise<RefundRow[]> {
  const { data } = await api.get<RefundRow[]>('/desk/refunds/');
  return data;
}

export async function decideRefund(
  id: string,
  payload: {
    decision: 'approve' | 'reject';
    method?: PayMethod;
    note?: string;
  } & Partial<Reversal>,
): Promise<RefundRow> {
  const { data } = await api.post<RefundRow>(`/desk/refunds/${id}/decision/`, payload);
  return data;
}

export interface CashSummary {
  date: string;
  methods: Record<PayMethod, { taken: string; refunded: string; expected: string }>;
  invoice_count: number;
  tips: string;
  unbilled_visits: number;
  closed: null | {
    expected_cash: string;
    counted_cash: string;
    difference: string;
    note: string;
    closed_by: string | null;
    closed_at: string;
  };
}

export async function getCashSummary(date: string): Promise<CashSummary> {
  const { data } = await api.get<CashSummary>('/desk/cash-close/', { params: { date } });
  return data;
}

export async function signCashClose(payload: {
  date: string;
  counted_cash: string;
  note: string;
}): Promise<CashSummary> {
  const { data } = await api.post<CashSummary>('/desk/cash-close/', payload);
  return data;
}

export async function getInventory(): Promise<{ low_count: number; results: PosProduct[] }> {
  const { data } = await api.get('/desk/inventory/');
  return data;
}
