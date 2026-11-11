import { api } from './client';
import type { Kpi, StatsTable } from './stats';

/** AIR Task 3: what AIR did, for the receptionist and the admin. Counted on the server. */

export type AirRange = 'since_last' | 'today' | '7d' | '30d';
export type AirActionType = 'booking' | 'payment' | 'order' | 'handoff' | 'other';
export type NeedsKind =
  'awaiting_stylist' | 'expired_link' | 'handed_to_desk' | 'callback' | 'refund_request';

export type AirKpiKey =
  | 'conversations'
  | 'booking_requests'
  | 'reception_accepted'
  | 'stylist_accepted'
  | 'declined_or_timed_out'
  | 'links_sent'
  | 'links_paid'
  | 'links_expired'
  | 'confirmed'
  | 'orders'
  | 'handed_off'
  | 'handover_rate'
  | 'stylists_auto_assigned'
  | 'reassignments';

export interface NeedsItem {
  kind: NeedsKind;
  kind_label: string;
  ref: string;
  title: string;
  customer: string;
  customer_id: string | null;
  when: string | null;
  link: string;
  claimed_by: string;
  claimed_at: string | null;
}

export interface AirCustomerRow {
  customer_id: string;
  name: string;
  actions: number;
  bookings: number;
  orders: number;
  handed_off: number;
  last: string | null;
  did: string[];
}

export type AirTableKey =
  | 'hourly'
  | 'funnel'
  | 'lost'
  | 'links'
  | 'stylists'
  | 'conversations'
  | 'products'
  | 'product_changes';

export interface AirStats {
  range: AirRange;
  range_label: string;
  period: { start: string; end: string; previous_start: string; previous_end: string };
  generated_at: string;
  counts: Record<string, number | null>;
  previous_counts: Record<string, number | null>;
  /** The "Any stylist" counts are new, so an older server may not send them. */
  kpis: Record<Exclude<AirKpiKey, 'stylists_auto_assigned' | 'reassignments'>, Kpi> &
    Partial<Record<'stylists_auto_assigned' | 'reassignments', Kpi>>;
  needs_you: NeedsItem[];
  tables: Record<AirTableKey, StatsTable>;
  channels: { chat: number; voice: number };
  customers: AirCustomerRow[];
  cover: { active: boolean; since: string | null };
}

export interface AirActivityRow {
  id: string;
  when: string;
  type: AirActionType;
  action: string;
  result: string;
  customer: string;
  customer_id: string | null;
  phone_masked: string;
  link: string;
  link_label: string;
  can_undo: boolean;
}

export interface AirBriefing {
  since: string;
  numbers: Record<string, number>;
  text: string;
  template_text: string;
  wording_by_ai: boolean;
  did_nothing: boolean;
  mood: 'idle' | 'report' | 'attention' | 'concerned' | 'celebrate';
}

export async function getAirStats(range: AirRange): Promise<AirStats> {
  return (await api.get<AirStats>('/air/desk/stats/', { params: { range } })).data;
}

export async function getAirActivity(
  range: AirRange,
  filters: { type?: AirActionType | ''; customer?: string },
): Promise<AirActivityRow[]> {
  const params: Record<string, string> = { range };
  if (filters.type) params.type = filters.type;
  if (filters.customer) params.customer = filters.customer;
  return (await api.get<{ results: AirActivityRow[] }>('/air/desk/activity/', { params })).data
    .results;
}

export async function claimNeeds(kind: NeedsKind, ref: string): Promise<void> {
  await api.post('/air/desk/needs/claim/', { kind, ref });
}

export async function resolveNeeds(kind: NeedsKind, ref: string): Promise<void> {
  await api.post('/air/desk/needs/resolve/', { kind, ref });
}

export async function undoAirAction(id: string): Promise<void> {
  await api.post(`/air/desk/activity/${id}/undo/`);
}

/** Shows one customer's phone number (the server writes an audit row). */
export async function revealPhone(customerId: string): Promise<string> {
  return (await api.get<{ phone: string }>(`/air/desk/customers/${customerId}/phone/`)).data.phone;
}

export async function getAirBriefing(): Promise<AirBriefing> {
  return (await api.get<AirBriefing>('/air/desk/briefing/')).data;
}

// ---- admin: AIR settings (the existing Prompt 1 endpoints) and usage

export interface AirSettings {
  master_enabled: boolean;
  air_enabled: boolean;
  presence_minutes: number;
  stylist_timeout_minutes: number;
  payment_link_minutes: number;
  undo_window_minutes: number;
  daily_request_cap: number;
  monthly_request_cap: number;
  breaker_failures: number;
  breaker_cooldown_seconds: number;
  request_timeout_seconds: number;
  retry_limit: number;
  max_order_quantity: number;
  monthly_spend_cap_rupees: string;
  cost_per_request_rupees: string;
  key_configured: boolean;
  provider: string;
  model: string;
  spend_shutoff_month: string;
  updated_at: string;
}

export interface AirUsage {
  today_requests: number;
  today_cost_rupees: string;
  month_requests: number;
  month_cost_rupees: string;
  daily_request_cap: number;
  monthly_request_cap: number;
  monthly_spend_cap_rupees: string;
  ai_available: boolean;
  ai_blocked_reason: string;
  breaker_open: boolean;
  breaker_open_until: string | null;
  cost_is_estimate: boolean;
  last_30_days_requests: number;
}

export interface AirCover {
  active: boolean;
  reason: string;
  force: 'auto' | 'on' | 'off';
  force_reason: string;
  forced_at: string | null;
  since: string | null;
  receptionist_on_shift: boolean;
  receptionist_logged_in: boolean;
  time_zone: string;
}

/** The admin status box: is desk cover on, active and why, the last sweep, waiting requests. */
export interface AirDeskStatus {
  cover_enabled: boolean;
  cover_active: boolean;
  cover_reason: string;
  cover_reason_text: string;
  presence_minutes: number;
  force: 'auto' | 'on' | 'off';
  last_sweep_at: string | null;
  scheduler_stale: boolean;
  scheduler_stale_minutes: number | null;
  last_error: string;
  waiting_count: number;
  waiting: { id: string; reason: string }[];
}

export async function getAirDeskStatus(): Promise<AirDeskStatus> {
  return (await api.get<AirDeskStatus>('/admin/air/status/')).data;
}

export async function getAirSettings(): Promise<AirSettings> {
  return (await api.get<AirSettings>('/admin/air/settings/')).data;
}

export async function updateAirSettings(changes: Partial<AirSettings>): Promise<AirSettings> {
  return (await api.patch<AirSettings>('/admin/air/settings/', changes)).data;
}

export async function getAirUsage(): Promise<AirUsage> {
  return (await api.get<AirUsage>('/admin/air/usage/')).data;
}

export async function getAirCover(): Promise<AirCover> {
  return (await api.get<AirCover>('/admin/air/cover/')).data;
}

export async function forceAirCover(
  mode: 'auto' | 'on' | 'off',
  reason: string,
): Promise<AirCover> {
  return (await api.post<AirCover>('/admin/air/cover/', { mode, reason })).data;
}
