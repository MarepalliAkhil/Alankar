import { api } from './client';

/** Task 6c: Staff Summary numbers and series, and monthly performance reviews (admin only). */

export interface Bucket {
  bucket: string;
  appointments: number;
  revenue: string;
  no_shows: number;
  avg_rating: string | null;
  rating_count: number;
  hours: string;
}
export interface Indicator {
  level: 'good' | 'watch' | 'concern' | 'no_data';
  rule: string;
}
export interface RatingIndicator extends Indicator {
  average: string | null;
  count: number;
}
export interface PunctualityIndicator extends Indicator {
  days: number;
  on_time: number;
  late: number;
  rate: string | null;
  has_shifts?: boolean;
  label?: string;
  missed?: number;
}
export interface RebookingIndicator extends Indicator {
  customers: number;
  rebooked: number;
  enough: boolean;
  rate: string | null;
  label: string;
}
export interface StylistRow {
  id: string;
  name: string;
  active: boolean;
  kpis: {
    appointments: number;
    revenue: string;
    avg_rating: string | null;
    rating_count: number;
    no_shows: number;
    earnings: string;
    tips: string;
    rebooking: RebookingIndicator;
    punctuality: PunctualityIndicator;
  };
  series: Bucket[];
}
export interface DeskRow {
  id: string;
  name: string;
  active: boolean;
  kpis: {
    hours: string;
    sessions: number;
    pay: string | null;
    flagged_sessions: number;
    corrected_sessions: number;
    on_time_rate: string | null;
    has_shifts: boolean;
  };
  series: { bucket: string; hours: string }[];
}
export interface StaffSummary {
  range: { start: string; end: string; bucket: 'week' | 'month' };
  team: {
    kpis: {
      appointments: number;
      revenue: string;
      avg_rating: string | null;
      rating_count: number;
      no_shows: number;
      hours: string;
      stylist_earnings: string;
      receptionist_pay: string;
      payroll_cost: string;
    };
    series: Bucket[];
  };
  stylists: StylistRow[];
  receptionists: DeskRow[];
}
export interface SummaryQuery {
  month?: string;
  start?: string;
  end?: string;
}

export async function getStaffSummary(query: SummaryQuery): Promise<StaffSummary> {
  return (await api.get<StaffSummary>('/admin/staff-summary/', { params: query })).data;
}

export type ReviewStatus = 'continue' | 'notice' | 'recommend_end';
export interface ReviewRecord {
  id: string;
  month: string;
  status: ReviewStatus;
  status_label: string;
  notes: string;
  decided_by: string;
  updated_at: string;
}
export interface ReviewPerson {
  id: string;
  name: string;
  role: 'stylist' | 'receptionist';
  active: boolean;
  indicators: {
    kind: 'stylist' | 'receptionist';
    unlinked?: boolean;
    completed_tasks?: number;
    no_shows?: number;
    hours?: string;
    flagged_sessions?: number;
    rating?: RatingIndicator;
    punctuality?: PunctualityIndicator;
    rebooking?: RebookingIndicator;
  };
  review: ReviewRecord | null;
}
export interface ReviewOverview {
  month: string;
  people: ReviewPerson[];
  statuses: { value: ReviewStatus; label: string }[];
}

export async function getReviews(month: string): Promise<ReviewOverview> {
  return (await api.get<ReviewOverview>('/admin/reviews/', { params: { month } })).data;
}
export async function getReviewHistory(id: string): Promise<ReviewRecord[]> {
  return (await api.get<ReviewRecord[]>(`/admin/reviews/${id}/`)).data;
}
export async function saveReview(
  id: string,
  body: { month: string; status: ReviewStatus; notes: string },
): Promise<ReviewRecord> {
  return (await api.put<ReviewRecord>(`/admin/reviews/${id}/`, body)).data;
}
