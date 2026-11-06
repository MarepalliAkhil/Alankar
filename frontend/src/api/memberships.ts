import { api } from './client';
import type { MembershipRow, PlanRow } from './wallet';

/** Task 8.5 part 6: the customer's Memberships page and the staff member list. Join, renew and
 * cancel use the existing wallet endpoints (api/wallet.ts). */

export interface MyMemberships {
  current: MembershipRow | null;
  past: MembershipRow[];
  plans: PlanRow[];
}

export async function getMyMemberships(): Promise<MyMemberships> {
  return (await api.get<MyMemberships>('/my/wallet/memberships/')).data;
}

export interface MemberRow extends MembershipRow {
  customer_email: string;
  can_end: boolean;
}

export interface MemberFilters {
  status?: string;
  plan?: string;
  q?: string;
}

export async function listMembers(filters: MemberFilters): Promise<{
  members: MemberRow[];
  counts: Record<string, number>;
  plans: string[];
}> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return (await api.get('/memberships/', { params })).data;
}

export async function endMembership(id: string, reason: string): Promise<MemberRow> {
  return (await api.post<MemberRow>(`/memberships/${id}/end/`, { reason })).data;
}
