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
export type CouponScope = 'all' | 'services' | 'products' | 'chosen';
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
  /** applies_to "chosen": the divisions, services and products it covers. */
  divisions?: string[];
  services?: string[];
  products?: string[];
  description?: string;
  first_visit_only?: boolean;
  /** Shown as a card on the customer payment page (off: a private code for campaigns). */
  listed?: boolean;
  /** The admin who created it (read-only). */
  created_by?: string;
  /** e.g. "10% off, up to Rs 200, minimum Rs 500, valid till 30 Nov" */
  terms?: string;
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
export type CampaignKind =
  'custom' | 'for_you' | 'products' | 'rebook' | 'most_booked' | 'top_rated' | 'offers';
export interface CampaignResults {
  sent: number;
  waiting: number;
  skipped: number;
  skipped_reasons: { reason: string; count: number }[];
  clicked: number;
  booked: number;
  booked_within_days: number;
}
export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: AudienceKind;
  audience_label: string;
  coupon: string | null;
  kind: CampaignKind;
  kind_label: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent';
  approved_at: string | null;
  approved_by: string | null;
  problem: string | null;
  results: CampaignResults | null;
  scheduled_for: string | null;
  sent_at: string | null;
  recipients: number | null;
  would_reach: number | null;
  created_at: string;
}
export interface CampaignList {
  opted_in: number;
  audiences: { value: AudienceKind; label: string }[];
  kinds?: { value: CampaignKind; label: string }[];
  limits?: { quiet_hours: number[]; min_days: number; quiet_now: boolean };
  consent_version?: string;
  results: CampaignRow[];
}
export interface CampaignPreview {
  problem: string | null;
  customer: { id: string; name: string } | null;
  subject?: string;
  text?: string;
  html?: string;
}
export type CampaignInput = Partial<
  Pick<CampaignRow, 'name' | 'subject' | 'body' | 'audience' | 'kind'>
> & {
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

export interface CouponReport {
  from: string;
  to: string;
  coupons: { code: string; title: string; uses: number; discount: string }[];
  total_uses: number;
  total_discount: string;
  with_coupon: { bookings: number; revenue: string };
  without_coupon: { bookings: number; revenue: string };
  note: string;
}
export async function getCouponReport(): Promise<CouponReport> {
  return (await api.get<CouponReport>(`${M}/coupons/report/`)).data;
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

export async function previewCampaign(id: string, customer?: string): Promise<CampaignPreview> {
  return (
    await api.get<CampaignPreview>(`${M}/campaigns/${id}/preview/`, {
      params: customer ? { customer } : undefined,
    })
  ).data;
}
export async function testCampaign(id: string): Promise<{ detail: string }> {
  return (await api.post<{ detail: string }>(`${M}/campaigns/${id}/test/`)).data;
}

export async function scheduleCampaign(id: string, sendAt: string): Promise<CampaignRow> {
  return (await api.post<CampaignRow>(`${M}/campaigns/${id}/schedule/`, { send_at: sendAt })).data;
}
export async function unscheduleCampaign(id: string): Promise<CampaignRow> {
  return (await api.post<CampaignRow>(`${M}/campaigns/${id}/unschedule/`)).data;
}
export async function runDueCampaigns(): Promise<{ sent: number }> {
  return (await api.post<{ sent: number }>(`${M}/campaigns/run-due/`)).data;
}

export type PrivateState = 'ready' | 'used' | 'expired' | 'withdrawn';
export interface PrivateCoupon {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: CouponKind;
  value: string;
  min_bill: string;
  max_discount: string | null;
  applies_to: CouponScope;
  ends_on: string | null;
  state: PrivateState;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  issued_at: string;
}
export interface IssueInput {
  name: string;
  prefix: string;
  kind: CouponKind;
  value: string;
  min_bill: string;
  max_discount?: string | null;
  applies_to: CouponScope;
  ends_on: string;
  customers?: string[];
  segment?: AudienceKind;
}
export interface IssueResult {
  issued: number;
  emailed: number;
  coupons: PrivateCoupon[];
}

export async function listPrivateCoupons(): Promise<PrivateCoupon[]> {
  return (await api.get<PrivateCoupon[]>(`${M}/private-coupons/`)).data;
}
export async function issuePrivateCoupons(body: IssueInput): Promise<IssueResult> {
  return (await api.post<IssueResult>(`${M}/private-coupons/`, body)).data;
}
export async function withdrawPrivateCoupon(id: string): Promise<PrivateCoupon> {
  return (await api.post<PrivateCoupon>(`${M}/private-coupons/${id}/withdraw/`)).data;
}

export async function unsubscribe(token: string): Promise<{ detail: string }> {
  return (await api.post<{ detail: string }>('/public/unsubscribe/', { token })).data;
}
