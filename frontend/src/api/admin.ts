import { api } from './client';

/** Task 5a: the admin's catalogue, staff details and days-off endpoints. */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export type DayHours = [string, string] | null;
export type WeeklyHours = Partial<Record<Weekday, DayHours>>;

export interface StylistProfileDetails {
  id: string;
  display_name: string;
  title: string;
  specialization: string;
  bio: string;
  photo_url: string;
  divisions: string[];
  service_ids: string[];
  is_public: boolean;
  /** Only the days the admin has set; a missing day follows the salon's hours. */
  weekly_hours: WeeklyHours;
  /** What applies in practice (salon hours where the stylist has no own entry). */
  effective_hours: Record<Weekday, DayHours | undefined>;
}

export interface ServiceChoice {
  id: string;
  name: string;
  division: string;
  category: string;
  is_active: boolean;
}

export interface StaffDetails {
  user_id: string;
  role: 'stylist' | 'receptionist';
  full_name: string;
  email: string;
  hourly_rate?: string | null;
  profile?: StylistProfileDetails | null;
  services?: ServiceChoice[];
  divisions?: { value: string; label: string }[];
  unlinked_profiles?: { id: string; display_name: string; title: string }[];
}

export type StylistDetailsPatch = Partial<
  Pick<
    StylistProfileDetails,
    | 'display_name'
    | 'title'
    | 'specialization'
    | 'bio'
    | 'photo_url'
    | 'divisions'
    | 'service_ids'
    | 'weekly_hours'
    | 'is_public'
  >
>;

export async function getStaffDetails(id: string): Promise<StaffDetails> {
  const { data } = await api.get<StaffDetails>(`/admin/staff/${id}/details/`);
  return data;
}

export async function updateStaffDetails(
  id: string,
  patch: StylistDetailsPatch,
): Promise<StaffDetails> {
  const { data } = await api.patch<StaffDetails>(`/admin/staff/${id}/details/`, patch);
  return data;
}

export async function linkStaffProfile(id: string, profile: string): Promise<StaffDetails> {
  const { data } = await api.post<StaffDetails>(`/admin/staff/${id}/link-profile/`, { profile });
  return data;
}

// ------------------------------------------------------------------------------- days off

export interface DayOffVisit {
  id: string;
  start: string;
  service_name: string;
  customer_name: string;
  status_label: string;
}

export interface DayOffRow {
  id: string;
  stylist: { id: string; name: string };
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  status_label: string;
  decision_note: string;
  decided_by: string;
  decided_at: string | null;
  created_at: string;
  conflicts: DayOffVisit[];
}

export async function listDaysOff(): Promise<DayOffRow[]> {
  const { data } = await api.get<{ results: DayOffRow[] }>('/admin/days-off/');
  return data.results;
}

export interface DecidePayload {
  decision: 'approve' | 'decline';
  reason?: string;
  acknowledge_conflicts?: boolean;
}

export async function decideDayOff(id: string, payload: DecidePayload): Promise<DayOffRow> {
  const { data } = await api.post<DayOffRow>(`/admin/days-off/${id}/decide/`, payload);
  return data;
}

// ------------------------------------------------------------------------------- catalogue

export interface Option {
  id?: string;
  label: string;
  price: string;
  duration_minutes: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface AdminService {
  id: string;
  category: string;
  category_name: string;
  division: string;
  name: string;
  slug: string;
  summary: string;
  description: string;
  audience: string;
  duration_minutes: number;
  price: string;
  gst_percent: string | null;
  task_payout: string | null;
  image_url: string;
  tags: string[];
  is_active: boolean;
  sort_order: number;
  variants: Required<Option>[];
  addons: Required<Option>[];
  visits: number;
}

export interface ServiceInput {
  category: string;
  name: string;
  summary: string;
  description: string;
  audience: string;
  duration_minutes: number;
  price: string;
  gst_percent: string | null;
  task_payout: string | null;
  is_active: boolean;
  variants: Option[];
  addons: Option[];
}

export interface AdminCategory {
  id: string;
  division: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  service_count: number;
  /** Task 8.5 part 4: product ids offered in the booking sheet for this category. */
  recommended_products?: string[];
}

export interface AdminRoom {
  id: string;
  name: string;
  division: string;
  is_active: boolean;
  sort_order: number;
}

export interface CatalogueOptions {
  divisions: { value: string; label: string }[];
  audiences: { value: string; label: string }[];
}

const CAT = '/admin/catalogue';

export async function getCatalogueOptions(): Promise<CatalogueOptions> {
  const { data } = await api.get<CatalogueOptions>(`${CAT}/options/`);
  return data;
}

export async function listAdminServices(): Promise<AdminService[]> {
  const { data } = await api.get<AdminService[]>(`${CAT}/services/`);
  return data;
}
export async function createService(body: ServiceInput): Promise<AdminService> {
  const { data } = await api.post<AdminService>(`${CAT}/services/`, body);
  return data;
}
export async function updateService(id: string, body: Partial<ServiceInput>) {
  const { data } = await api.patch<AdminService>(`${CAT}/services/${id}/`, body);
  return data;
}
export async function deleteService(id: string): Promise<void> {
  await api.delete(`${CAT}/services/${id}/`);
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const { data } = await api.get<AdminCategory[]>(`${CAT}/categories/`);
  return data;
}
export type CategoryInput = Pick<
  AdminCategory,
  'division' | 'name' | 'sort_order' | 'is_active' | 'recommended_products'
>;
export async function createCategory(body: Partial<CategoryInput>): Promise<AdminCategory> {
  const { data } = await api.post<AdminCategory>(`${CAT}/categories/`, body);
  return data;
}
export async function updateCategory(id: string, body: Partial<CategoryInput>) {
  const { data } = await api.patch<AdminCategory>(`${CAT}/categories/${id}/`, body);
  return data;
}
export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`${CAT}/categories/${id}/`);
}

export async function listAdminRooms(): Promise<AdminRoom[]> {
  const { data } = await api.get<AdminRoom[]>(`${CAT}/rooms/`);
  return data;
}
export type RoomInput = Pick<AdminRoom, 'name' | 'division' | 'is_active' | 'sort_order'>;
export async function createRoom(body: Partial<RoomInput>): Promise<AdminRoom> {
  const { data } = await api.post<AdminRoom>(`${CAT}/rooms/`, body);
  return data;
}
export async function updateRoom(id: string, body: Partial<RoomInput>) {
  const { data } = await api.patch<AdminRoom>(`${CAT}/rooms/${id}/`, body);
  return data;
}
export async function deleteRoom(id: string): Promise<void> {
  await api.delete(`${CAT}/rooms/${id}/`);
}
