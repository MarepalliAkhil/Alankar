import { api } from './client';

/** Task 6a: admin view of ratings (with moderation) and of stylist pay for a month. */

export type Moderation = 'active' | 'under_review' | 'excluded';
export type ModerationAction = 'flag' | 'exclude' | 'restore';

export interface TrendPoint {
  month: string;
  average: string;
  count: number;
}
export interface StylistRatingSummary {
  id: string;
  name: string;
  active: boolean;
  count: number;
  average: string | null;
  trend: TrendPoint[];
  direction: 'up' | 'down' | 'steady' | 'new';
  under_review: number;
  excluded: number;
  needs_attention: boolean;
}
export interface AdminRating {
  id: string;
  stars: number;
  comment: string;
  tags: string[];
  date: string;
  customer: string;
  service: string;
  moderation: Moderation;
  moderation_label: string;
  reason: string;
  moderated_by: string;
  moderated_at: string | null;
}
export interface StylistRatingDetail {
  id: string;
  name: string;
  count: number;
  average: string | null;
  distribution: Record<string, number>;
  trend: TrendPoint[];
  direction: StylistRatingSummary['direction'];
  pending: number;
  ratings: AdminRating[];
}

export async function listRatingSummaries(): Promise<StylistRatingSummary[]> {
  return (await api.get<StylistRatingSummary[]>('/admin/ratings/')).data;
}
export async function getStylistRatings(id: string, moderation = ''): Promise<StylistRatingDetail> {
  const { data } = await api.get<StylistRatingDetail>(`/admin/ratings/stylists/${id}/`, {
    params: moderation ? { moderation } : {},
  });
  return data;
}
export async function moderateRating(id: string, action: ModerationAction, reason: string) {
  const { data } = await api.post<{ id: string; moderation: Moderation }>(
    `/admin/ratings/${id}/moderate/`,
    { action, reason },
  );
  return data;
}

export interface PayRating {
  count: number;
  needed: number;
  enough: boolean;
  average: string | null;
  multiplier: string;
  flagged: boolean;
}
export interface PayStylistRow {
  id: string;
  name: string;
  active: boolean;
  invoices: number;
  rating: PayRating;
  tasks_pay: string;
  tips: string;
  total: string;
  waiting_checkout: number;
}
export interface StylistPayList {
  month: string;
  estimated: boolean;
  rules: { min_ratings: number; bands: { label: string; multiplier: string }[] };
  stylists: PayStylistRow[];
  totals: { tasks: string; tips: string; total: string; invoices: number };
  reconciliation: { tips_on_invoices: string; tips_in_pay: string; difference: string };
}
export interface PayTaskRow {
  id: string;
  date: string;
  invoice: string;
  customer: string;
  service: string;
  service_price: string;
  partial: boolean;
  stars: number | null;
  rating_state: 'counted' | 'unrated' | 'held';
  base_payout: string;
  multiplier: string;
  payout: string;
  tip: string;
  total: string;
}
export interface StylistPayDetail {
  month: string;
  id: string;
  name: string;
  estimated: boolean;
  rating: PayRating;
  tasks: PayTaskRow[];
  waiting_checkout: { id: string; date: string | null; service: string }[];
  totals: { tasks: string; tips: string; total: string };
}

export async function listStylistPay(month: string): Promise<StylistPayList> {
  return (await api.get<StylistPayList>('/admin/pay/stylists/', { params: { month } })).data;
}
export async function getStylistPay(id: string, month: string): Promise<StylistPayDetail> {
  return (await api.get<StylistPayDetail>(`/admin/pay/stylists/${id}/`, { params: { month } }))
    .data;
}
