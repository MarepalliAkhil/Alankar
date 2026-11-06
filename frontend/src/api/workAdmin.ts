import { api } from './client';

/** Task 6b: admin view of receptionists' hours, sessions, shifts, punctuality and pay. */

export interface PunctualitySummary {
  has_shifts: boolean;
  label?: string;
  shifts_counted?: number;
  on_time?: number;
  late?: number;
  missed?: number;
  on_time_rate?: string | null;
}
export interface PunctualityDay {
  date: string;
  shift: string;
  state: 'on_time' | 'late' | 'missed';
  minutes_late: number | null;
  signed_in: string | null;
}
export interface MonthPay {
  hourly_rate: string | null;
  hours: string;
  sessions: number;
  corrected_sessions: number;
  pay: string | null;
  days: { date: string; hours: string }[];
}
export interface ReceptionistSummary {
  id: string;
  name: string;
  active: boolean;
  pay: MonthPay;
  flagged_sessions: number;
  punctuality: PunctualitySummary;
}
export interface ReceptionistList {
  month: string;
  receptionists: ReceptionistSummary[];
  totals: { hours: string; pay: string };
  grace_minutes: number;
  long_hours: number;
}
export interface SessionFlag {
  code: 'long' | 'overlap' | 'idle' | 'stale';
  label: string;
}
export interface AdminSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  hours: string;
  open: boolean;
  end_reason: string;
  end_reason_label: string;
  corrected: boolean;
  corrected_by: string;
  correction_reason: string;
  flags: SessionFlag[];
}
export type ShiftDay = { start: string; end: string } | null;
export interface ReceptionistDetail extends ReceptionistSummary {
  month: string;
  grace_minutes: number;
  long_hours: number;
  sessions: AdminSession[];
  shifts: ShiftDay[];
  punctuality: PunctualitySummary & { days: PunctualityDay[] };
}

export async function listReceptionists(month: string): Promise<ReceptionistList> {
  return (await api.get<ReceptionistList>('/admin/work/receptionists/', { params: { month } }))
    .data;
}
export async function getReceptionist(id: string, month: string): Promise<ReceptionistDetail> {
  const { data } = await api.get<ReceptionistDetail>(`/admin/work/receptionists/${id}/`, {
    params: { month },
  });
  return data;
}
export async function saveShifts(id: string, shifts: ShiftDay[]): Promise<void> {
  const days = shifts.flatMap((s, weekday) => (s ? [{ weekday, start: s.start, end: s.end }] : []));
  await api.put(`/admin/work/receptionists/${id}/shifts/`, { days });
}
export async function correctSession(
  id: string,
  body: { started_at: string; ended_at: string; reason: string },
): Promise<void> {
  await api.post(`/staff/work-sessions/${id}/correct/`, body);
}
