import { api } from './client';

/** Personal recommendations (customer) and their results and settings (admin). */

export interface RecService {
  id: string;
  name: string;
  slug: string;
  category: string;
  division: string;
  duration_minutes: number;
  from_price: string;
}
export interface ForYouItem {
  service: RecService;
  reasons: string[];
  score: number;
}
export interface RebookItem {
  service: RecService;
  reason: string;
  last_visit: string;
  slots: string[];
  stylist: { id: string; name: string } | null;
}
export interface AftercareBlock {
  after: string;
  products: { id: string; name: string; price: string; reason: string }[];
}
export interface QuietTime {
  weekday: number;
  hour: number;
  label: string;
  visits: number;
  weeks: number;
}
export interface MyRecommendations {
  available: boolean;
  enabled: boolean;
  notice_seen: boolean;
  rate_first: { rating_id: string; service: string; stylist: string } | null;
  pinned_offer: { id: number; title: string; description: string } | null;
  for_you: ForYouItem[];
  rebook: RebookItem[];
  aftercare: AftercareBlock | null;
  quiet_times: QuietTime[];
}
export interface RecPrefs {
  enabled: boolean;
  notice_seen: boolean;
  interests: string[];
  categories: { id: string; name: string; division: string }[];
  not_interested: { id: string; name: string }[];
}
export type Placement = 'dashboard' | 'rebook' | 'addon' | 'aftercare' | 'chat' | 'email';
export interface Addon {
  service: RecService;
  start: string;
  stylist: { id: string; name: string };
  reason: string;
}

const MY = '/my/recommendations';

export async function getMyRecommendations(): Promise<MyRecommendations> {
  return (await api.get<MyRecommendations>(`${MY}/`)).data;
}
export async function getRecPrefs(): Promise<RecPrefs> {
  return (await api.get<RecPrefs>(`${MY}/prefs/`)).data;
}
export async function saveRecPrefs(
  body: Partial<{ enabled: boolean; notice_seen: boolean; interests: string[] }>,
): Promise<RecPrefs> {
  return (await api.patch<RecPrefs>(`${MY}/prefs/`, body)).data;
}
export async function recFeedback(body: {
  action: 'click' | 'not_interested' | 'undo';
  placement?: Placement;
  service?: string;
  product?: string;
}): Promise<void> {
  await api.post(`${MY}/feedback/`, body);
}
export async function getAddon(params: {
  service: string;
  stylist: string;
  start: string;
}): Promise<Addon | null> {
  return (await api.get<{ addon: Addon | null }>(`${MY}/addon/`, { params })).data.addon;
}

export interface Metric {
  placement: Placement;
  label: string;
  impressions: number;
  clicks: number;
  dismissed: number;
  bookings: number;
  click_rate: number | null;
  conversion: number | null;
}
export interface Evaluation {
  status?: 'ok' | 'too_few' | 'not_enough_data';
  cutoff?: string;
  train_visits?: number;
  test_visits?: number;
  customers?: number;
  k?: number;
  hit_rate?: number;
  precision?: number;
  baseline_hit_rate?: number;
  baseline_precision?: number;
  note?: string;
}
export interface AdminRecommendations {
  settings: {
    enabled: boolean;
    rebook_reminders: boolean;
    excluded_services: string[];
    pinned_offer: number | null;
  };
  services: { id: string; name: string; category: string }[];
  offers: { id: number; title: string }[];
  built_at: string | null;
  visits_used: number;
  pairs: number;
  quiet_times: QuietTime[];
  evaluation: Evaluation;
  window_days: number;
  booked_within_days: number;
  metrics: Metric[];
  customers_off: number;
}
const ADMIN = '/admin/recommendations';

export async function getAdminRecommendations(): Promise<AdminRecommendations> {
  return (await api.get<AdminRecommendations>(`${ADMIN}/`)).data;
}
export async function saveAdminRecommendations(
  body: Partial<AdminRecommendations['settings']>,
): Promise<AdminRecommendations> {
  return (await api.patch<AdminRecommendations>(`${ADMIN}/settings/`, body)).data;
}
export async function rebuildRecommendations(): Promise<AdminRecommendations> {
  return (await api.post<AdminRecommendations>(`${ADMIN}/rebuild/`)).data;
}
