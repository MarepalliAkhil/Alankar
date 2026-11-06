import { api } from './client';

export interface WorkSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  hours: string;
  open: boolean;
  end_reason: string;
  end_reason_label: string;
  corrected: boolean;
  correction_reason: string;
}

export interface MyHours {
  month: string;
  hourly_rate: string | null;
  total_hours: string;
  today_hours: string;
  estimated_pay: string | null;
  working_now: boolean;
  idle_minutes: number;
  sessions: WorkSessionRow[];
}

/** Tells the server the receptionist is really using the page (keeps the session alive). */
export async function pingActivity(): Promise<{ idle_minutes: number }> {
  const { data } = await api.post<{ idle_minutes: number }>('/auth/activity/');
  return data;
}

export async function getMyHours(month?: string): Promise<MyHours> {
  const { data } = await api.get<MyHours>('/desk/my-hours/', { params: month ? { month } : {} });
  return data;
}
