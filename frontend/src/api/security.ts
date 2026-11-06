import { api } from './client';

/** Task 5d: audit log, sign-in security, staff sessions and customer data requests (admin). */

export interface AuditRow {
  id: number;
  action: string;
  actor_email: string;
  target_email: string;
  email: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface AuditPage {
  count: number;
  page: number;
  pages: number;
  results: AuditRow[];
  actions: { value: string; label: string }[];
}
export interface AuditFilters {
  action: string;
  actor: string;
  q: string;
  from: string;
  to: string;
}

const clean = (f: Partial<AuditFilters>) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;

export async function getAuditLog(
  filters: Partial<AuditFilters>,
  page: number,
): Promise<AuditPage> {
  return (await api.get<AuditPage>('/admin/audit/', { params: { ...clean(filters), page } })).data;
}
export async function downloadAuditCsv(filters: Partial<AuditFilters>): Promise<Blob> {
  return (
    await api.get<Blob>('/admin/audit/export/', { params: clean(filters), responseType: 'blob' })
  ).data;
}

export interface SecurityOverview {
  failed_7d: number;
  lockouts_7d: number;
  top_emails: { email: string; count: number }[];
  recent_failures: { email: string; ip_address: string | null; at: string }[];
  locks: { email: string; locked_until: string }[];
}
export async function getSecurity(): Promise<SecurityOverview> {
  return (await api.get<SecurityOverview>('/admin/security/')).data;
}
export async function unlockEmail(email: string): Promise<void> {
  await api.post('/admin/security/unlock/', { email });
}

export interface StaffSession {
  id: string;
  email: string;
  name: string;
  role: string;
  signed_in_at: string | null;
  expires_at: string;
  current: boolean;
}
export async function listSessions(): Promise<StaffSession[]> {
  return (await api.get<StaffSession[]>('/admin/security/sessions/')).data;
}
export async function revokeSession(id: string): Promise<void> {
  await api.post(`/admin/security/sessions/${id}/revoke/`);
}

export type RequestStatus = 'pending' | 'completed' | 'declined' | 'cancelled';
export interface AdminDataRequest {
  id: string;
  kind: 'export' | 'delete';
  status: RequestStatus;
  customer_label: string;
  customer_email: string;
  created_at: string;
  decided_at: string | null;
  decided_by_email: string;
  decision_note: string;
  blockers: string[];
}
export async function listDataRequests(): Promise<AdminDataRequest[]> {
  return (await api.get<AdminDataRequest[]>('/admin/data-requests/')).data;
}
export async function decideDataRequest(
  id: string,
  decision: 'complete' | 'decline',
  note: string,
): Promise<AdminDataRequest> {
  return (
    await api.post<AdminDataRequest>(`/admin/data-requests/${id}/decide/`, { decision, note })
  ).data;
}
