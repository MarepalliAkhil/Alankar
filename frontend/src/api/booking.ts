import type { AppointmentStatus } from '../types/appointment';
import { api } from './client';
import type { Service } from './public';

/** Customer-safe stylist card (no phone, pay or schedule). */
export interface StylistCard {
  id: string;
  display_name: string;
  title: string;
  photo_url: string;
}

export interface BookingOptions {
  service: Service;
  stylists: StylistCard[];
  /** ISO dates (yyyy-mm-dd) the shop is open, from today up to the booking window. */
  days: string[];
  rules: {
    deposit_percent: number;
    free_cancel_hours: number;
    hold_hours: number;
    gst_percent: number;
  };
  contact: { name: string; email: string; phone: string; allergies: string };
  /** Visits the customer has not rated yet; new requests are blocked while this is above 0. */
  pending_ratings: number;
  /** Task 8.5 part 4: products the salon suggests with this service. */
  recommended_products?: RecommendedProduct[];
}

export interface RecommendedProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  in_stock: boolean;
  available: number;
}

export interface AppointmentProductRow {
  id: string;
  product: string;
  name: string;
  quantity: number;
  amount: string;
  paid_online: boolean;
  status: 'held' | 'billed';
}

export interface SlotQuery {
  service: string;
  variant?: string;
  addons?: string[];
  date: string;
  stylist?: string;
}

export interface SlotResult {
  date: string;
  duration_minutes: number;
  price_total: string;
  gst_amount: string;
  amount_payable: string;
  slots: string[];
}

export interface BookingRequestPayload {
  service: string;
  variant?: string | null;
  addons: string[];
  start: string;
  stylist?: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  allergies: string;
  package_code?: string;
  products?: { product: string; quantity: number }[];
  consent: boolean;
}

export interface PackageUsed {
  purchase_id: string;
  purchase_name: string;
  last4: string;
  masked: string;
  service_name: string;
  session_label: string;
  status: 'reserved' | 'consumed' | 'released';
}

export type CustomerAction =
  'cancel' | 'request_cancel' | 'pay' | 'resend_link' | 'arrived' | 'reschedule';

interface AppointmentBase {
  id: string;
  status: AppointmentStatus;
  status_label: string;
  service_name: string;
  service_slug: string;
  division: string;
  variant_label: string;
  addon_labels: string[];
  duration_minutes: number;
  price_total: string;
  gst_amount: string;
  amount_payable: string;
  preferred_start: string;
  preferred_stylist_name: string | null;
  stylist_name: string | null;
  room_name: string | null;
  start: string | null;
  end: string | null;
  awaiting_payment_until: string | null;
  arrived_at: string | null;
  reschedule_requested: boolean;
  reschedule_preferred: string | null;
  cancel_requested: boolean;
  created_at: string;
  notes: string;
  allergies: string;
  package_used: PackageUsed | null;
  products?: AppointmentProductRow[];
}

export interface ApprovalInfo {
  stage: 'waiting' | 'declined' | 'confirmed';
  label: string;
  message: string;
  answer_by?: string;
}

export interface RebookInfo {
  service: string;
  variant: string | null;
  addons: string[];
  start: string;
}

/** A staff change (13C) the customer has not answered yet. */
export interface PendingChange {
  id: string;
  kind: 'moved' | 'reassigned' | 'cancelled';
  reason: string;
  old_start: string | null;
  new_start: string | null;
  new_stylist_name: string | null;
  can_accept: boolean;
  can_cancel: boolean;
  can_rebook: boolean;
}

/** One step of the request timeline. `text` is always shown, so no state relies on colour. */
export interface TimelineStep {
  key: 'requested' | 'front_desk' | 'stylist' | 'payment_link' | 'paid' | 'confirmed';
  label: string;
  state: 'done' | 'waiting' | 'stopped' | 'problem' | 'skipped';
  text: string;
  at: string | null;
  actor?: 'receptionist' | 'air';
  expires_at?: string | null;
}

/** The sorry note for a request the salon could not keep. Words come from the server, the same
 * ones as the email and the bell notification. */
export interface SorryNote {
  event:
    | 'stylist_declined'
    | 'reception_declined'
    | 'timed_out'
    | 'link_expired'
    | 'moved'
    | 'reassigned'
    | 'cancelled';
  title: string;
  parts: { apology: string; what: string; next: string; step: string; money: string };
  text: string;
  nearest_slots: { start: string; label: string }[];
  phone: string;
}

export interface CustomerAppointment extends AppointmentBase {
  /** Only the TYPE of who accepted and a ready-made label; never the receptionist. */
  reception_actor?: '' | 'receptionist' | 'air';
  reception_label?: string;
  /** The customer chose "Any stylist". */
  any_stylist?: boolean;
  /** "Stylist: Asha, assigned by AIR" (only who has it now, never who declined). */
  stylist_note?: string;
  timeline?: TimelineStep[];
  sorry_note?: SorryNote | null;
  approval?: ApprovalInfo | null;
  rebook?: RebookInfo | null;
  pending_change?: PendingChange | null;
  actions: CustomerAction[];
  free_cancel_until: string | null;
  amount_paid: string;
  /** The coupon used on the online payment, if any, and its rupees. */
  coupon_code?: string;
  coupon_discount?: string;
  /** Zen Chat thread with this visit's stylist, once the visit is scheduled. */
  chat_thread_id: string | null;
}

export interface PaymentState {
  /** due = pay now; replaced = an older link; expired = slot released; paid; none */
  state: 'due' | 'replaced' | 'expired' | 'paid' | 'none';
  amount: string;
  expires_at: string | null;
  /** Task 8.5: the online price step by step (coupon, then membership). */
  quote?: PaymentQuote | null;
  coupon_error?: string;
  /** The coupon applied on this payment (kept by the server; docs/COUPONS.md). */
  applied_coupon?: string;
  /** Every listed, active, in-date coupon, with whether it can be used on this payment. */
  coupons?: CouponCard[];
  appointment: CustomerAppointment;
}

export interface CouponCard {
  code: string;
  title: string;
  description: string;
  /** e.g. "10% off, up to Rs 200 · minimum order Rs 500 · Spa services only · valid till 30 Nov" */
  terms: string;
  eligible: boolean;
  /** Why it cannot be used here, e.g. "Add Rs 200 more to use this". */
  reason: string;
  saves: string;
  best: boolean;
  applied: boolean;
}

export interface QuoteLine {
  kind: 'service' | 'product';
  description: string;
  amount: string;
  coupon: string;
}

export interface CouponResult {
  applied_coupon: string;
  quote: PaymentQuote;
  coupons: CouponCard[];
}

export interface PaymentQuote {
  lines?: QuoteLine[];
  items_total: string;
  eligible_total?: string;
  taxable_value?: string;
  gst_included?: string;
  coupon_code: string;
  coupon_amount: string;
  member_plan: string;
  member_percent: string;
  member_amount: string;
  discount: string;
  total: string;
}

export async function getBookingOptions(service: string): Promise<BookingOptions> {
  const { data } = await api.get<BookingOptions>('/booking/options/', { params: { service } });
  return data;
}

export async function getSlots(query: SlotQuery): Promise<SlotResult> {
  const params = new URLSearchParams({ service: query.service, date: query.date });
  if (query.variant) params.set('variant', query.variant);
  if (query.stylist) params.set('stylist', query.stylist);
  (query.addons ?? []).forEach((id) => params.append('addons', id));
  const { data } = await api.get<SlotResult>('/booking/slots/', { params });
  return data;
}

export async function sendBookingRequest(
  payload: BookingRequestPayload,
): Promise<CustomerAppointment> {
  const { data } = await api.post<CustomerAppointment>('/booking/requests/', payload);
  return data;
}

export async function listMyAppointments(): Promise<CustomerAppointment[]> {
  const { data } = await api.get<CustomerAppointment[]>('/my/appointments/');
  return data;
}

export type MyActionPath = 'cancel' | 'request-cancel' | 'arrived' | 'reschedule' | 'resend-link';

export async function actOnAppointment(
  id: string,
  action: MyActionPath,
  body: Record<string, string> = {},
): Promise<CustomerAppointment> {
  const { data } = await api.post<CustomerAppointment>(`/my/appointments/${id}/${action}/`, body);
  return data;
}

export async function respondToChange(
  id: string,
  response: 'accept' | 'rebook' | 'cancel',
  preferred?: string,
): Promise<CustomerAppointment> {
  const { data } = await api.post<CustomerAppointment>(`/my/appointments/${id}/change/`, {
    response,
    ...(preferred ? { preferred } : {}),
  });
  return data;
}

export function rebookLink(rebook: RebookInfo): string {
  const q = new URLSearchParams({ service: rebook.service, start: rebook.start });
  if (rebook.variant) q.set('variant', rebook.variant);
  if (rebook.addons.length) q.set('addons', rebook.addons.join(','));
  return `/customer/book?${q.toString()}`;
}

export async function getPayment(
  id: string,
  link?: string | null,
  coupon?: string,
): Promise<PaymentState> {
  const { data } = await api.get<PaymentState>(`/my/appointments/${id}/payment/`, {
    params: { ...(link ? { link } : {}), ...(coupon ? { coupon } : {}) },
  });
  return data;
}

/** Only the code is sent: the server works out the discount and the new total. */
export async function applyCoupon(
  id: string,
  code: string,
  link?: string | null,
): Promise<CouponResult> {
  const { data } = await api.post<CouponResult>(`/my/appointments/${id}/payment/coupon/`, {
    code,
    link: link ?? '',
  });
  return data;
}

export async function removeCoupon(id: string, link?: string | null): Promise<CouponResult> {
  const { data } = await api.delete<CouponResult>(`/my/appointments/${id}/payment/coupon/`, {
    params: link ? { link } : {},
  });
  return data;
}

export async function payAppointment(
  id: string,
  outcome: 'success' | 'fail',
  link?: string | null,
  gift?: { code: string; amount?: string } | null,
  coupon?: string,
): Promise<{ appointment: CustomerAppointment }> {
  const { data } = await api.post<{ appointment: CustomerAppointment }>(
    `/my/appointments/${id}/payment/`,
    {
      outcome,
      link: link ?? '',
      ...(coupon ? { coupon } : {}),
      ...(gift?.code
        ? { gift_card_code: gift.code, ...(gift.amount ? { gift_card_amount: gift.amount } : {}) }
        : {}),
    },
  );
  return data;
}

/** The nearest free times a 409 conflict suggests, if any. */
export function conflictSlots(error: unknown): string[] {
  const data = (error as { response?: { status?: number; data?: { slots?: unknown } } })?.response;
  if (data?.status !== 409 || !Array.isArray(data.data?.slots)) return [];
  return data.data.slots.filter((slot): slot is string => typeof slot === 'string');
}

/** The server marks a package-code problem with `field: "package_code"` even when its HTTP
 * status is 409 (an already-used/expired code) or 429 (rate-limited), so it isn't mistaken for a
 * just-taken time slot. Returns the message to show under the code field, if that is what
 * happened. */
export function packageCodeFieldError(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { field?: unknown; detail?: unknown } } })?.response
    ?.data;
  if (data?.field !== 'package_code') return undefined;
  return typeof data.detail === 'string' ? data.detail : 'That package code could not be used.';
}

// ----------------------------------------------------------------------------- profile

export interface Profile {
  full_name: string;
  email: string;
  phone: string;
  allergies: string;
  preferences: string;
  marketing_opt_in: boolean;
  /** When the customer last ticked or unticked the marketing box. */
  marketing_opt_changed_at?: string | null;
  /** The exact wording next to the marketing box (its version is recorded with each change). */
  marketing_text?: string;
}

export async function getProfile(): Promise<Profile> {
  const { data } = await api.get<Profile>('/my/profile/');
  return data;
}

export type ProfilePayload = Omit<Profile, 'email' | 'marketing_opt_changed_at' | 'marketing_text'>;

export async function updateProfile(payload: ProfilePayload): Promise<Profile> {
  const { data } = await api.patch<Profile>('/my/profile/', payload);
  return data;
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/password/change/', payload);
  return data;
}
