import { api } from './client';

export interface StylistCard {
  id: string;
  status: string;
  status_label: string;
  start: string | null;
  end: string | null;
  duration_minutes: number;
  customer_first_name: string;
  service_name: string;
  variant_label: string;
  addon_labels: string[];
  room_name: string | null;
  allergy_alert: boolean;
  /** The customer sent a "Style reference" photo for this visit in Zen Chat. */
  reference_photo?: boolean;
  actions: string[];
}

export interface StylistDetail extends StylistCard {
  allergies: string;
  preferences: string;
  booked_services: { key: string; label: string }[];
  history: { date: string | null; service_name: string; variant_label: string }[];
  completion: { done: string[]; removed: string[]; note: string; completed_at: string } | null;
}

export type Scope = 'today' | 'upcoming' | 'past';

export async function listAppointments(scope: Scope): Promise<StylistCard[]> {
  const { data } = await api.get<{ results: StylistCard[] }>('/stylist/appointments/', {
    params: { scope },
  });
  return data.results;
}

export async function getAppointment(id: string): Promise<StylistDetail> {
  const { data } = await api.get<StylistDetail>(`/stylist/appointments/${id}/`);
  return data;
}

export async function startVisit(id: string): Promise<StylistDetail> {
  const { data } = await api.post<StylistDetail>(`/stylist/appointments/${id}/start/`);
  return data;
}

export async function completeVisit(
  id: string,
  done: string[],
  note: string,
): Promise<StylistDetail> {
  const { data } = await api.post<StylistDetail>(`/stylist/appointments/${id}/complete/`, {
    done,
    note,
  });
  return data;
}

export interface RatingsOverview {
  count: number;
  /** Ratings the admin is looking at; shown only as a number, never with details. */
  under_review: number;
  average: string | null;
  distribution: Record<string, number>;
  trend: { month: string; average: string; count: number }[];
  comments: { stars: number; comment: string; tags: string[]; date: string; service: string }[];
}

export async function getRatings(): Promise<RatingsOverview> {
  const { data } = await api.get<RatingsOverview>('/stylist/ratings/');
  return data;
}

export interface Earnings {
  month: string;
  estimated: boolean;
  rating: {
    count: number;
    needed: number;
    enough: boolean;
    average: string | null;
    multiplier: string;
    flagged: boolean;
  };
  rules: { min_ratings: number; bands: { label: string; multiplier: string }[] };
  tasks: {
    id: string;
    date: string;
    service: string;
    partial: boolean;
    base_payout: string;
    multiplier: string;
    payout: string;
    tip: string;
    total: string;
  }[];
  waiting_checkout: { id: string; date: string | null; service: string }[];
  totals: { tasks: string; tips: string; total: string };
}

export async function getEarnings(month?: string): Promise<Earnings> {
  const { data } = await api.get<Earnings>('/stylist/earnings/', {
    params: month ? { month } : {},
  });
  return data;
}

export interface DayOff {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  status_label: string;
  decision_note: string;
}

export interface MySchedule {
  hours: { day: string; hours: [string, string] | null; own: boolean }[];
  days_off: DayOff[];
}

export async function getSchedule(): Promise<MySchedule> {
  const { data } = await api.get<MySchedule>('/stylist/schedule/');
  return data;
}

export interface ClashVisit {
  id: string;
  start: string;
  service_name: string;
  customer_first_name: string;
  status_label: string;
}

export async function requestDaysOff(input: {
  start_date: string;
  end_date: string;
  reason: string;
}): Promise<DayOff> {
  const { data } = await api.post<DayOff>('/stylist/days-off/', input);
  return data;
}

export async function withdrawDaysOff(id: string): Promise<DayOff> {
  const { data } = await api.post<DayOff>(`/stylist/days-off/${id}/withdraw/`);
  return data;
}

// --------------------------------------------------------------------------- Task 13A: Requests

export type ApprovalState = 'not_asked' | 'pending' | 'accepted' | 'declined';

/** A booking request addressed to me. First name only: no phone, email, price or payment. */
export interface StylistRequest {
  id: string;
  customer_first_name: string;
  service_name: string;
  variant_label: string;
  addon_labels: string[];
  start: string;
  duration_minutes: number;
  allergy_alert: boolean;
  my_status: ApprovalState;
  my_status_label: string;
  reception_status: ApprovalState;
  reception_status_label: string;
  booking_status: string;
  booking_status_label: string;
  answer_by: string | null;
  minutes_left: number | null;
  can_answer: boolean;
}

export interface RequestsOverview {
  pending_count: number;
  pending: StylistRequest[];
  answered: StylistRequest[];
}

/** The reasons a stylist may give when declining. Only the front desk and the stylist see them. */
export const declineReasons = [
  { value: 'busy', label: 'Busy at that time' },
  { value: 'personal_plans', label: 'Personal plans' },
  { value: 'outside_hours', label: 'Outside my working hours' },
  { value: 'other', label: 'Other' },
] as const;
export type DeclineReason = (typeof declineReasons)[number]['value'];

export async function listRequests(): Promise<RequestsOverview> {
  const { data } = await api.get<RequestsOverview>('/stylist/requests/');
  return data;
}

export async function acceptRequest(id: string): Promise<StylistRequest> {
  const { data } = await api.post<StylistRequest>(`/stylist/requests/${id}/accept/`);
  return data;
}

export async function declineStylistRequest(
  id: string,
  reason: DeclineReason,
): Promise<StylistRequest> {
  const { data } = await api.post<StylistRequest>(`/stylist/requests/${id}/decline/`, { reason });
  return data;
}

// --------------------------------------------------------------------------- Task 13B / 13C

export interface CalendarDay {
  date: string;
  hours: [string, string] | null;
  day_off: boolean;
  visits: StylistCard[];
  waiting_requests: {
    id: string;
    customer_first_name: string;
    service_name: string;
    start: string;
    end: string;
  }[];
}

export async function getCalendar(from: string, to: string): Promise<CalendarDay[]> {
  const { data } = await api.get<{ days: CalendarDay[] }>('/stylist/calendar/', {
    params: { from, to },
  });
  return data.days;
}

export type StylistChangeReason =
  'stylist_unavailable' | 'schedule_change' | 'room_or_equipment' | 'staff_emergency' | 'other';

/** The preset reasons shown to the customer (in a sorry note) when the stylist changes a visit. */
export const stylistChangeReasons: { value: StylistChangeReason; label: string }[] = [
  { value: 'stylist_unavailable', label: 'I am not available' },
  { value: 'schedule_change', label: 'Change in the schedule' },
  { value: 'room_or_equipment', label: 'Room or equipment problem' },
  { value: 'staff_emergency', label: 'Unexpected emergency' },
  { value: 'other', label: 'Other' },
];

export async function cancelOwnVisit(
  id: string,
  reason: StylistChangeReason,
  note = '',
): Promise<{ id: string; status: string }> {
  const { data } = await api.post<{ id: string; status: string }>(
    `/stylist/appointments/${id}/cancel/`,
    { reason, note },
  );
  return data;
}

export async function getMoveSlots(id: string, date: string): Promise<string[]> {
  const { data } = await api.get<{ slots: string[] }>(`/stylist/appointments/${id}/move/`, {
    params: { date },
  });
  return data.slots;
}

export async function moveOwnVisit(
  id: string,
  start: string,
  reason: StylistChangeReason,
): Promise<{ id: string; status: string; start: string }> {
  const { data } = await api.post<{ id: string; status: string; start: string }>(
    `/stylist/appointments/${id}/move/`,
    { start, reason },
  );
  return data;
}
