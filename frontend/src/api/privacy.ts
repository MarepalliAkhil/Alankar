import type { RequestStatus } from './security';
import { api } from './client';

/** Task 5d: the customer's own data requests. */

export interface MyDataRequest {
  id: string;
  kind: 'export' | 'delete';
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
  download_until: string | null;
  can_download: boolean;
}
export async function listMyRequests(): Promise<MyDataRequest[]> {
  return (await api.get<MyDataRequest[]>('/my/data-requests/')).data;
}
export async function createMyRequest(kind: 'export' | 'delete'): Promise<MyDataRequest> {
  return (await api.post<MyDataRequest>('/my/data-requests/', { kind })).data;
}
export async function cancelMyRequest(id: string): Promise<void> {
  await api.post(`/my/data-requests/${id}/cancel/`);
}
export async function downloadMyData(id: string): Promise<Blob> {
  return (await api.get<Blob>(`/my/data-requests/${id}/download/`, { responseType: 'blob' })).data;
}
