import type { AppointmentStatus } from '../types/appointment';
import type { StylistCard } from './booking';
import { api } from './client';

export type DeskFilter =
  'requested' | 'awaiting_payment' | 'payment_expired' | 'scheduled' | 'flags' | 'closed';

export type DeskAction =
  | 'confirm'
  | 'reject'
  | 'resend_link'
  | 'move'
  | 'cancel'
  | 'no_show'
  | 'check_in'
  | 'decline_reschedule'
  | 'decline_cancel';

export interface DeskEvent {
  action: string;
  from_status: string;
  to_status: string;
  note: string;
  actor_name: string;
  created_at: string;
}

export interface DeskAppointment {
  id: string;
  status: AppointmentStatus;
  status_label: string;
  service_name: string;
  division: string;
  variant_label: string;
  addon_labels: string[];
  duration_minutes: number;
  price_total: string;
  amount_payable: string;
  preferred_start: string;
  preferred_stylist_name: string | null;
  preferred_stylist_id: string | null;
  stylist_name: string | null;
  stylist_id: string | null;
  room_name: string | null;
  room_id: string | null;
  start: string | null;
  end: string | null;
  awaiting_payment_until: string | null;
  arrived_at: string | null;
  reschedule_requested: boolean;
  reschedule_preferred: string | null;
  reschedule_note: string;
  cancel_requested: boolean;
  cancel_reason: string;
  reject_reason: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  allergies: string;
  source: string;
  created_at: string;
  events: DeskEvent[];
  actions: DeskAction[];
}

export interface DeskList {
  counts: Record<DeskFilter, number>;
  results: DeskAppointment[];
}

export interface ConfirmOptions {
  stylists: (StylistCard & { free_at_preferred: boolean; preferred: boolean })[];
  rooms: { id: string; name: string; division: string }[];
  date: string;
  slots: string[];
}

export async function listDeskAppointments(status: DeskFilter): Promise<DeskList> {
  const { data } = await api.get<DeskList>('/desk/appointments/', { params: { status } });
  return data;
}

export async function getConfirmOptions(
  id: string,
  query: { date?: string; stylist?: string; room?: string },
): Promise<ConfirmOptions> {
  const params = Object.fromEntries(Object.entries(query).filter(([, value]) => !!value));
  const { data } = await api.get<ConfirmOptions>(`/desk/appointments/${id}/options/`, { params });
  return data;
}

export async function confirmRequest(
  id: string,
  payload: { stylist: string; start: string; room?: string | null },
): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/confirm/`, payload);
  return data;
}

export async function rejectRequest(id: string, reason: string): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/reject/`, { reason });
  return data;
}

export async function resendPaymentLink(id: string): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/resend-link/`);
  return data;
}

export interface Placement {
  stylist: string;
  start: string;
  room?: string | null;
}

export async function moveAppointment(id: string, payload: Placement): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/move/`, payload);
  return data;
}

export async function cancelAppointment(id: string, reason: string): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/cancel/`, { reason });
  return data;
}

export async function checkInAppointment(id: string): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/check-in/`);
  return data;
}

export async function markNoShow(id: string): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/no-show/`);
  return data;
}

export async function declineRequest(
  id: string,
  flag: 'reschedule' | 'cancel',
  note = '',
): Promise<DeskAppointment> {
  const { data } = await api.post<DeskAppointment>(`/desk/appointments/${id}/dismiss/`, {
    flag,
    note,
  });
  return data;
}

export interface ScheduleItem {
  id: string;
  status: AppointmentStatus;
  status_label: string;
  service_name: string;
  customer_name: string;
  stylist_id: string | null;
  room_id: string | null;
  start: string;
  end: string;
  duration_minutes: number;
  arrived_at: string | null;
  reschedule_requested: boolean;
  cancel_requested: boolean;
  source: string;
  actions: DeskAction[];
}

export interface ScheduleDay {
  date: string;
  closed: boolean;
  open: string | null;
  close: string | null;
  step_minutes: number;
  stylists: StylistCard[];
  /** Stylists who are not working this day (approved day off, or outside their weekly hours). */
  off?: { stylist: string; name: string; reason: string }[];
  rooms: { id: string; name: string; division: string }[];
  appointments: ScheduleItem[];
}

export async function getSchedule(date: string): Promise<ScheduleDay> {
  const { data } = await api.get<ScheduleDay>('/desk/schedule/', { params: { date } });
  return data;
}

export async function getDeskAppointment(id: string): Promise<DeskAppointment> {
  const { data } = await api.get<DeskAppointment>(`/desk/appointments/${id}/`);
  return data;
}
