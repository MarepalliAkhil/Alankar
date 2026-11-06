import { api } from './client';

/** Task 5e-1: packages, memberships, gift cards and the waitlist. */

export type Money = string;
export type SellMethod = 'cash' | 'card' | 'upi';
export type Outcome = 'success' | 'fail';

export interface PackageItemRow {
  service: string;
  service_name: string;
  quantity: number;
  list_price: Money;
}
export interface PackageRow {
  id: string;
  name: string;
  description: string;
  price: Money;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
  items: PackageItemRow[];
  sold?: number;
}
export interface PackageInput {
  name: string;
  description?: string;
  price: string;
  validity_days: number;
  is_active?: boolean;
  items: { service: string; quantity: number }[];
}

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  price: Money;
  period_months: 1 | 3 | 12;
  discount_percent: Money;
  applies_to_products: boolean;
  included_sessions: number;
  included_services: { id: string; name: string }[];
  rules: string;
  is_active: boolean;
  sort_order: number;
  members?: number;
}
export interface PlanInput {
  name: string;
  description?: string;
  price: string;
  period_months: number;
  discount_percent: string;
  applies_to_products?: boolean;
  included_sessions?: number;
  included_services?: string[];
  rules?: string;
  is_active?: boolean;
}

export interface Catalogue {
  packages: PackageRow[];
  plans: PlanRow[];
}

export interface PackageCreditRow {
  id: string;
  service_name: string;
  quantity: number;
  remaining: number;
  unit_value: Money;
}
export interface PackageLedgerRow {
  id: string;
  service_name: string;
  delta: number;
  reason: string;
  reason_label: string;
  invoice: string | null;
  appointment: string | null;
  note: string;
  created_at: string;
  actor: string | null;
}
export type PackageCancelStatus = 'none' | 'pending' | 'cancelled';
export interface PurchaseRow {
  id: string;
  name: string;
  price_paid: Money;
  purchased_at: string;
  expires_at: string;
  sale_number: string;
  customer_name: string;
  customer_id: string;
  last4: string;
  masked: string;
  code_available: boolean;
  cancel_status: PackageCancelStatus;
  credits: PackageCreditRow[];
  remaining: number;
  refunded: Money;
  ledger?: PackageLedgerRow[];
  pending_cancel_request?: { id: string; estimated_refund: Money } | null;
}

export interface PackageCancelEstimate {
  estimated_refund: Money;
  cancellation_fee_percent: string;
  refund_window_days: number | null;
  already_pending: boolean;
}
export interface PackageCancelRequestRow {
  id: string;
  purchase_id: string;
  package_name: string;
  customer_name: string;
  customer_id: string;
  reason: string;
  remaining_sessions: number;
  total_sessions: number;
  amount_paid: Money;
  estimated_refund: Money;
  status: 'pending' | 'approved' | 'rejected';
  decided_amount: Money | null;
  decision_reason: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface MembershipLedgerRow {
  id: string;
  reason: string;
  reason_label: string;
  sessions_change: number;
  sessions_after: number;
  invoice: string | null;
  note: string;
  created_at: string;
}
export interface MembershipRow {
  id: string;
  plan_name: string;
  price: Money;
  period_months: number;
  discount_percent: Money;
  applies_to_products: boolean;
  included_sessions: number;
  included_services: string[];
  sessions_left: number;
  status: 'active' | 'cancelled' | 'ended';
  status_label: string;
  started_at: string;
  period_end: string;
  cancelled_at: string | null;
  can_renew: boolean;
  ended_at?: string | null;
  end_reason?: string;
  customer_name?: string;
  customer_id?: string;
  ledger?: MembershipLedgerRow[];
}

export interface GiftCardRow {
  id: string;
  last4: string;
  masked: string;
  initial_amount: Money;
  balance: Money;
  usable_balance: Money;
  status: 'active' | 'void';
  expired: boolean;
  expires_at: string;
  issued_at: string;
  recipient_name: string;
  code_available: boolean;
  role?: 'bought' | 'received';
  buyer_name?: string;
  recipient_email?: string;
  sale_number?: string;
  channel?: 'pos' | 'online';
  ledger?: {
    id: string;
    delta: Money;
    reason: string;
    reason_label: string;
    note: string;
    created_at: string;
  }[];
}

export interface SaleRow {
  id: string;
  number: string;
  kind: 'package' | 'membership' | 'gift_card';
  kind_label: string;
  channel: 'pos' | 'online';
  method: string;
  amount: Money;
  refunded: Money;
  description: string;
  customer_name: string;
  created_at: string;
}

export interface MyWallet {
  packages: PurchaseRow[];
  membership: MembershipRow | null;
  gift_cards: GiftCardRow[];
  sessions_total: number;
  catalogue: Catalogue;
}

export interface GiftCardBuyInput {
  amount: string;
  recipient_name?: string;
  recipient_email?: string;
  message?: string;
  outcome?: Outcome;
}

export interface WaitlistOffer {
  id: string;
  start: string;
  end: string;
  expires_at: string;
  stylist_name: string;
}
export interface WaitlistRow {
  id: string;
  service: string;
  service_name: string;
  variant: string | null;
  variant_label: string;
  stylist: string | null;
  stylist_name: string;
  window_start: string;
  window_end: string;
  note: string;
  status: 'waiting' | 'offered' | 'booked' | 'cancelled' | 'expired';
  status_label: string;
  created_at: string;
  appointment: string | null;
  offer: WaitlistOffer | null;
  customer_name?: string;
}
export interface WaitlistInput {
  service: string;
  variant?: string | null;
  stylist?: string | null;
  window_start: string;
  window_end: string;
  note?: string;
}

// ---------------------------------------------------------------- customer

export async function getMyWallet(): Promise<MyWallet> {
  return (await api.get<MyWallet>('/my/wallet/')).data;
}
export async function buyPackage(id: string, outcome: Outcome = 'success'): Promise<PurchaseRow> {
  return (await api.post<PurchaseRow>(`/my/wallet/packages/${id}/buy/`, { outcome })).data;
}
export async function joinMembership(plan: string, outcome: Outcome = 'success') {
  return (await api.post<MembershipRow>('/my/wallet/memberships/join/', { plan, outcome })).data;
}
export async function renewMembership(outcome: Outcome = 'success') {
  return (await api.post<MembershipRow>('/my/wallet/memberships/renew/', { outcome })).data;
}
export async function cancelMembership() {
  return (await api.post<MembershipRow>('/my/wallet/memberships/cancel/')).data;
}
export async function buyGiftCard(input: GiftCardBuyInput) {
  return (await api.post<{ card: GiftCardRow; code: string }>('/my/wallet/gift-cards/buy/', input))
    .data;
}
export interface CardCheck {
  last4: string;
  masked: string;
  balance: Money;
  expires_at: string;
}
export async function checkMyGiftCard(code: string): Promise<CardCheck> {
  return (await api.post<CardCheck>('/my/wallet/gift-cards/check/', { code })).data;
}
export async function revealMyGiftCardCode(id: string): Promise<{ code: string }> {
  return (await api.post<{ code: string }>(`/my/wallet/gift-cards/${id}/reveal/`)).data;
}

export async function listMyPackages(): Promise<PurchaseRow[]> {
  return (await api.get<PurchaseRow[]>('/my/wallet/packages/')).data;
}
export async function revealMyPackageCode(id: string): Promise<{ code: string }> {
  return (await api.post<{ code: string }>(`/my/wallet/packages/${id}/reveal/`)).data;
}
export async function estimatePackageCancelRefund(id: string): Promise<PackageCancelEstimate> {
  return (await api.get<PackageCancelEstimate>(`/my/wallet/packages/${id}/cancel-estimate/`)).data;
}
export async function requestPackageCancellation(
  id: string,
  reason: string,
): Promise<{ id: string; status: string; estimated_refund: Money }> {
  return (
    await api.post<{ id: string; status: string; estimated_refund: Money }>(
      `/my/wallet/packages/${id}/cancel-request/`,
      { reason },
    )
  ).data;
}

export async function listMyWaitlist(): Promise<WaitlistRow[]> {
  return (await api.get<WaitlistRow[]>('/my/waitlist/')).data;
}
export async function joinWaitlist(input: WaitlistInput): Promise<WaitlistRow> {
  return (await api.post<WaitlistRow>('/my/waitlist/', input)).data;
}
export async function leaveWaitlist(id: string): Promise<WaitlistRow> {
  return (await api.post<WaitlistRow>(`/my/waitlist/${id}/cancel/`)).data;
}
export async function acceptOffer(id: string): Promise<{ appointment: string; status: string }> {
  return (
    await api.post<{ appointment: string; status: string }>(`/my/waitlist/offers/${id}/accept/`)
  ).data;
}
export async function declineOffer(id: string): Promise<void> {
  await api.post(`/my/waitlist/offers/${id}/decline/`);
}

// ---------------------------------------------------------------- counter

export async function getDeskCatalogue(): Promise<Catalogue> {
  return (await api.get<Catalogue>('/desk/wallet/catalogue/')).data;
}
export async function getDeskCustomerWallet(id: string) {
  return (
    await api.get<Omit<MyWallet, 'catalogue' | 'gift_cards'>>(`/desk/wallet/customers/${id}/`)
  ).data;
}
export interface SellInput {
  kind: 'package' | 'membership' | 'membership_renewal' | 'gift_card';
  method: SellMethod;
  customer?: string | null;
  package?: string | null;
  plan?: string | null;
  amount?: string | null;
  buyer_name?: string;
  recipient_name?: string;
  recipient_email?: string;
  message?: string;
}
export interface SellResult {
  sale: SaleRow;
  purchase?: PurchaseRow;
  membership?: MembershipRow;
  card?: GiftCardRow;
  code?: string;
}
export async function sell(input: SellInput): Promise<SellResult> {
  return (await api.post<SellResult>('/desk/wallet/sell/', input)).data;
}
export async function checkDeskGiftCard(code: string): Promise<CardCheck> {
  return (await api.post<CardCheck>('/desk/wallet/gift-cards/check/', { code })).data;
}

// ---------------------------------------------------------------- admin

const A = '/admin';
export async function listPackages(): Promise<PackageRow[]> {
  return (await api.get<PackageRow[]>(`${A}/packages/`)).data;
}
export async function createPackage(body: PackageInput): Promise<PackageRow> {
  return (await api.post<PackageRow>(`${A}/packages/`, body)).data;
}
export async function updatePackage(id: string, body: Partial<PackageInput>): Promise<PackageRow> {
  return (await api.patch<PackageRow>(`${A}/packages/${id}/`, body)).data;
}
export async function listPurchases(): Promise<PurchaseRow[]> {
  return (await api.get<PurchaseRow[]>(`${A}/packages/purchases/`)).data;
}
export async function refundPackage(id: string, method: SellMethod, reason: string) {
  return (await api.post(`${A}/packages/purchases/${id}/refund/`, { method, reason })).data;
}
export async function restorePackageUse(entryId: string, reason: string) {
  return (await api.post(`${A}/packages/uses/${entryId}/restore/`, { reason })).data;
}
export async function listPlans(): Promise<PlanRow[]> {
  return (await api.get<PlanRow[]>(`${A}/membership-plans/`)).data;
}
export async function createPlan(body: PlanInput): Promise<PlanRow> {
  return (await api.post<PlanRow>(`${A}/membership-plans/`, body)).data;
}
export async function updatePlan(id: string, body: Partial<PlanInput>): Promise<PlanRow> {
  return (await api.patch<PlanRow>(`${A}/membership-plans/${id}/`, body)).data;
}
export async function listMembers(): Promise<MembershipRow[]> {
  return (await api.get<MembershipRow[]>(`${A}/memberships/`)).data;
}
export async function restoreMembershipUse(entryId: string, reason: string) {
  return (await api.post(`${A}/memberships/uses/${entryId}/restore/`, { reason })).data;
}
export async function listGiftCards(): Promise<GiftCardRow[]> {
  return (await api.get<GiftCardRow[]>(`${A}/gift-cards/`)).data;
}
export async function getGiftCard(id: string): Promise<GiftCardRow> {
  return (await api.get<GiftCardRow>(`${A}/gift-cards/${id}/`)).data;
}
export async function voidGiftCard(id: string, reason: string) {
  return (await api.post(`${A}/gift-cards/${id}/void/`, { reason })).data;
}
export async function revealGiftCardCode(id: string): Promise<{ code: string }> {
  return (await api.post<{ code: string }>(`${A}/gift-cards/${id}/reveal/`)).data;
}
export async function listPackageCancelRequests(): Promise<PackageCancelRequestRow[]> {
  return (await api.get<PackageCancelRequestRow[]>(`${A}/package-cancel-requests/`)).data;
}
export async function approvePackageCancelRequest(
  id: string,
  input: { method: SellMethod; amount?: string; reason?: string },
): Promise<PackageCancelRequestRow> {
  return (
    await api.post<PackageCancelRequestRow>(`${A}/package-cancel-requests/${id}/approve/`, input)
  ).data;
}
export async function rejectPackageCancelRequest(
  id: string,
  reason: string,
): Promise<PackageCancelRequestRow> {
  return (
    await api.post<PackageCancelRequestRow>(`${A}/package-cancel-requests/${id}/reject/`, {
      reason,
    })
  ).data;
}
export async function listSales(kind?: string): Promise<SaleRow[]> {
  return (await api.get<SaleRow[]>(`${A}/sales/`, { params: kind ? { kind } : {} })).data;
}
export async function listAdminWaitlist(status?: string): Promise<WaitlistRow[]> {
  return (await api.get<WaitlistRow[]>(`${A}/waitlist/`, { params: status ? { status } : {} }))
    .data;
}
export async function adminCancelWaitlist(id: string, reason: string): Promise<WaitlistRow> {
  return (await api.post<WaitlistRow>(`${A}/waitlist/${id}/cancel/`, { reason })).data;
}

export interface MyCoupon {
  id: string;
  code: string;
  name: string;
  description: string;
  ends_on: string | null;
  state: 'ready' | 'used' | 'expired';
}
export async function getMyCoupons(): Promise<MyCoupon[]> {
  return (await api.get<MyCoupon[]>('/my/coupons/')).data;
}
