import type { Role } from '../policy/policy';
import { api } from './client';

export type StaffRole = Extract<Role, 'stylist' | 'receptionist'>;

export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  status: 'active' | 'invited' | 'deactivated';
  date_joined: string;
}

export interface StaffInvite {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor_email: string | null;
  email: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InvitePayload {
  full_name: string;
  email: string;
  role: StaffRole;
}

export async function listStaff(): Promise<StaffMember[]> {
  const { data } = await api.get<StaffMember[]>('/staff/');
  return data;
}

export async function listInvites(): Promise<StaffInvite[]> {
  const { data } = await api.get<StaffInvite[]>('/staff/invites/');
  return data;
}

export async function createInvite(payload: InvitePayload): Promise<StaffInvite> {
  const { data } = await api.post<StaffInvite>('/staff/invites/', payload);
  return data;
}

export async function deactivateStaff(id: string): Promise<StaffMember> {
  const { data } = await api.post<StaffMember>(`/staff/${id}/deactivate/`);
  return data;
}

export async function reactivateStaff(id: string): Promise<StaffMember> {
  const { data } = await api.post<StaffMember>(`/staff/${id}/reactivate/`);
  return data;
}

export async function listAudit(): Promise<AuditEntry[]> {
  const { data } = await api.get<AuditEntry[]>('/audit/');
  return data;
}
