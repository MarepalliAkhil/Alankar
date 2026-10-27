import { api } from './client';

/** Task 5c: offers, coupons, loyalty rules and campaigns (admin) plus the public unsubscribe. */

export interface OfferRow {
  id: number;
  title: string;
  description: string;
  badge: string;
  valid_until: string | null;
  is_active: boolean;
  sort_order: number;
}
export type OfferInput = Partial<Omit<OfferRow, 'id'>>;

export type CouponKind = 'percent' | 'flat';
export type CouponScope = 'all' | 'services' | 'products';
export type CouponState = 'live' | 'off' | 'scheduled' | 'expired' | 'used_up';

export interface CouponRow {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  value: string;
  min_bill: string;
  max_discount: string | null;
  starts_on: string | null;
  ends_on: string | null;
  total_limit: number | null;
  per_customer_limit: number;
  applies_to: CouponScope;
  stackable: boolean;
  is_active: boolean;
  used: number;
  state: CouponState;
}
export type CouponInput = Partial<Omit<CouponRow, 'id' | 'used' | 'state'>>;

export interface LoyaltyRules {
  loyalty_points_per_100: number;
  loyalty_point_value: number;
  loyalty_max_redeem_percent: number;
}

export type AudienceKind = 'all' | 'recent' | 'lapsed';
export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: AudienceKind;
  audience_label: string;
  coupon: string | null;
  status: 'draft' | 'sent';
  sent_at: string | null;
  recipients: number | null;
  would_reach: number | null;
  created_at: string;
}
export interface CampaignList {
  opted_in: number;
  audiences: { value: AudienceKind; label: string }[];
  results: CampaignRow[];
}
export type CampaignInput = Partial<Pick<CampaignRow, 'name' | 'subject' | 'body' | 'audience'>> & {
  coupon?: string | null;
};

const M = '/admin/marketing';

export async function listOffers(): Promise<OfferRow[]> {
  return (await api.get<OfferRow[]>(`${M}/offers/`)).data;
}
export async function createOffer(body: OfferInput): Promise<OfferRow> {
  return (await api.post<OfferRow>(`${M}/offers/`, body)).data;
}
export async function updateOffer(id: number, body: OfferInput): Promise<OfferRow> {
  return (await api.patch<OfferRow>(`${M}/offers/${id}/`, body)).data;
}
export async function deleteOffer(id: number): Promise<void> {
  await api.delete(`${M}/offers/${id}/`);
}

export async function listCoupons(): Promise<CouponRow[]> {
  return (await api.get<CouponRow[]>(`${M}/coupons/`)).data;
}
export async function createCoupon(body: CouponInput): Promise<CouponRow> {
  return (await api.post<CouponRow>(`${M}/coupons/`, body)).data;
}
export async function updateCoupon(id: string, body: CouponInput): Promise<CouponRow> {
  return (await api.patch<CouponRow>(`${M}/coupons/${id}/`, body)).data;
}

export async function getLoyalty(): Promise<LoyaltyRules> {
  return (await api.get<LoyaltyRules>(`${M}/loyalty/`)).data;
}
export async function saveLoyalty(body: Partial<LoyaltyRules>): Promise<LoyaltyRules> {
  return (await api.patch<LoyaltyRules>(`${M}/loyalty/`, body)).data;
}

export async function listCampaigns(): Promise<CampaignList> {
  return (await api.get<CampaignList>(`${M}/campaigns/`)).data;
}
export async function createCampaign(body: CampaignInput): Promise<CampaignRow> {
  return (await api.post<CampaignRow>(`${M}/campaigns/`, body)).data;
}
export async function updateCampaign(id: string, body: CampaignInput): Promise<CampaignRow> {
  return (await api.patch<CampaignRow>(`${M}/campaigns/${id}/`, body)).data;
}
export async function deleteCampaign(id: string): Promise<void> {
  await api.delete(`${M}/campaigns/${id}/`);
}
export async function sendCampaign(id: string): Promise<CampaignRow> {
  return (await api.post<CampaignRow>(`${M}/campaigns/${id}/send/`)).data;
}

export async function unsubscribe(token: string): Promise<{ detail: string }> {
  return (await api.post<{ detail: string }>('/public/unsubscribe/', { token })).data;
}
