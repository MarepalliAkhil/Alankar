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
