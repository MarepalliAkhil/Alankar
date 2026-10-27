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
  consent: boolean;
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
  reject_reason: string;
  created_at: string;
  notes: string;
  allergies: string;
}

export interface CustomerAppointment extends AppointmentBase {
  actions: CustomerAction[];
  free_cancel_until: string | null;
  amount_paid: string;
  /** Zen Chat thread with this visit's stylist, once the visit is scheduled. */
  chat_thread_id: string | null;
}

export interface PaymentState {
  /** due = pay now; replaced = an older link; expired = slot released; paid; none */
  state: 'due' | 'replaced' | 'expired' | 'paid' | 'none';
  amount: string;
  expires_at: string | null;
  appointment: CustomerAppointment;
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

export async function getPayment(id: string, link?: string | null): Promise<PaymentState> {
  const { data } = await api.get<PaymentState>(`/my/appointments/${id}/payment/`, {
    params: link ? { link } : {},
  });
  return data;
}

export async function payAppointment(
  id: string,
  outcome: 'success' | 'fail',
  link?: string | null,
): Promise<{ appointment: CustomerAppointment }> {
  const { data } = await api.post<{ appointment: CustomerAppointment }>(
    `/my/appointments/${id}/payment/`,
    { outcome, link: link ?? '' },
  );
  return data;
}

/** The nearest free times a 409 conflict suggests, if any. */
export function conflictSlots(error: unknown): string[] {
  const data = (error as { response?: { status?: number; data?: { slots?: unknown } } })?.response;
  if (data?.status !== 409 || !Array.isArray(data.data?.slots)) return [];
  return data.data.slots.filter((slot): slot is string => typeof slot === 'string');
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
}

export async function getProfile(): Promise<Profile> {
  const { data } = await api.get<Profile>('/my/profile/');
  return data;
}

export type ProfilePayload = Omit<Profile, 'email' | 'marketing_opt_changed_at'>;

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
