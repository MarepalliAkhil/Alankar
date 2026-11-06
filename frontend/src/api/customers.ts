import type { AppointmentStatus } from '../types/appointment';
import type { StylistCard } from './booking';
import type { DeskAppointment } from './desk';
import { api } from './client';

export interface CustomerSummary {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  has_allergies: boolean;
  email_verified: boolean;
  visits: number | null;
}

export interface CustomerVisit {
  id: string;
  status: AppointmentStatus;
  status_label: string;
  service_name: string;
  variant_label: string;
  start: string | null;
  stylist_name: string | null;
  amount: string;
  source: string;
  invoice_number: string | null;
}

export interface CustomerNote {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}

export interface CustomerDetail extends CustomerSummary {
  allergies: string;
  preferences: string;
  joined: string;
  stats: {
    visits: number;
    no_shows: number;
    cancellations: number;
    last_visit: string | null;
    next_visit: string | null;
    pending_ratings: number;
  };
  visits_list: CustomerVisit[];
  notes: CustomerNote[];
}

export interface NewCustomer {
  full_name: string;
  email: string;
  phone: string;
  allergies?: string;
  preferences?: string;
}

export type CustomerEdit = Partial<
  Pick<NewCustomer, 'full_name' | 'phone' | 'allergies' | 'preferences'>
>;

export async function searchCustomers(
  q: string,
): Promise<{ count: number; results: CustomerSummary[] }> {
  const { data } = await api.get('/desk/customers/', { params: q ? { q } : {} });
  return data;
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const { data } = await api.get<CustomerDetail>(`/desk/customers/${id}/`);
  return data;
}

export async function createCustomer(payload: NewCustomer): Promise<CustomerDetail> {
  const { data } = await api.post<CustomerDetail>('/desk/customers/', payload);
  return data;
}

export async function editCustomer(id: string, payload: CustomerEdit): Promise<CustomerDetail> {
  const { data } = await api.patch<CustomerDetail>(`/desk/customers/${id}/`, payload);
  return data;
}

export async function addCustomerNote(id: string, body: string): Promise<CustomerDetail> {
  const { data } = await api.post<CustomerDetail>(`/desk/customers/${id}/notes/`, { body });
  return data;
}

export interface DeskSlots {
  date: string;
  duration_minutes: number;
  price_total: string;
  amount_payable: string;
  stylists: StylistCard[];
  rooms: { id: string; name: string; division: string }[];
  slots: { start: string; stylists: string[] }[];
}

export async function getDeskSlots(query: {
  service: string;
  variant?: string;
  addons?: string[];
  date: string;
}): Promise<DeskSlots> {
  const params = new URLSearchParams({ service: query.service, date: query.date });
  if (query.variant) params.set('variant', query.variant);
  (query.addons ?? []).forEach((id) => params.append('addons', id));
  const { data } = await api.get<DeskSlots>('/desk/slots/', { params });
  return data;
}

export interface DeskBookingPayload {
  customer: string;
  service: string;
  variant?: string | null;
  addons: string[];
  start: string;
  stylist: string;
  room?: string | null;
  source: 'walk_in' | 'phone';
  notes: string;
  check_in_now: boolean;
}

export async function createDeskBooking(payload: DeskBookingPayload): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>('/desk/bookings/', payload);
  return data;
}
