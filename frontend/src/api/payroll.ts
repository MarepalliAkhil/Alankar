import { api } from './client';

/** Task 6c: payroll runs (admin) and payslips (each staff member sees only their own). */

export type RunStatus = 'draft' | 'approved' | 'paid';
export interface AdjustmentRow {
  id: string;
  kind: 'bonus' | 'deduction';
  kind_label: string;
  amount: string;
  reason: string;
  created_at: string;
  created_by: string;
  after_approval: boolean;
  voided: boolean;
  void_reason: string;
}
export interface RunRow {
  id: string;
  month: string;
  status: RunStatus;
  status_label: string;
  staff: number;
  net: string;
  approved_at: string | null;
  paid_at: string | null;
}
export interface RunItem {
  id: string;
  name: string;
  role: 'stylist' | 'receptionist';
  base_pay: string;
  tips: string;
  adjustments_total: string;
  adjustments: number;
  net: string;
}
export interface RunDetail {
  id: string;
  month: string;
  status: RunStatus;
  status_label: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string;
  paid_at: string | null;
  paid_by: string;
  payment_reference: string;
  simulated_payment: boolean;
  items: RunItem[];
  totals: { base_pay: string; tips: string; adjustments: string; net: string };
  checks: {
    tips_on_invoices: string;
    tips_in_run: string;
    invoices_in_month: number;
    visits_in_run: number;
    waiting_checkout: number;
  };
}
export interface Payslip {
  id: string;
  run: {
    id: string;
    month: string;
    status: RunStatus;
    status_label: string;
    approved_at: string | null;
    paid_at: string | null;
    payment_reference: string;
  };
  name: string;
  role: 'stylist' | 'receptionist';
  base_pay: string;
  tips: string;
  adjustments: AdjustmentRow[];
  adjustments_total: string;
  net: string;
  components: Record<string, unknown>;
  locked: boolean;
}
export interface PayslipRow {
  id: string;
  month: string;
  status: RunStatus;
  status_label: string;
  net: string;
}

export async function listRuns(): Promise<RunRow[]> {
  return (await api.get<RunRow[]>('/admin/payroll/runs/')).data;
}
export async function getRun(id: string): Promise<RunDetail> {
  return (await api.get<RunDetail>(`/admin/payroll/runs/${id}/`)).data;
}
export async function createRun(month: string): Promise<RunDetail> {
  return (await api.post<RunDetail>('/admin/payroll/runs/', { month })).data;
}
export async function refreshRun(id: string): Promise<RunDetail> {
  return (await api.post<RunDetail>(`/admin/payroll/runs/${id}/refresh/`)).data;
}
export async function approveRun(id: string): Promise<RunDetail> {
  return (await api.post<RunDetail>(`/admin/payroll/runs/${id}/approve/`)).data;
}
export async function payRun(id: string, reference: string): Promise<RunDetail> {
  return (await api.post<RunDetail>(`/admin/payroll/runs/${id}/pay/`, { reference })).data;
}
export async function getItem(id: string): Promise<Payslip> {
  return (await api.get<Payslip>(`/admin/payroll/items/${id}/`)).data;
}
export async function addAdjustment(
  itemId: string,
  body: { kind: 'bonus' | 'deduction'; amount: string; reason: string },
): Promise<Payslip> {
  return (await api.post<Payslip>(`/admin/payroll/items/${itemId}/adjustments/`, body)).data;
}
export async function voidAdjustment(id: string, reason: string): Promise<Payslip> {
  return (await api.post<Payslip>(`/admin/payroll/adjustments/${id}/void/`, { reason })).data;
}
export async function myPayslips(): Promise<PayslipRow[]> {
  return (await api.get<PayslipRow[]>('/payslips/')).data;
}
export async function myPayslip(id: string): Promise<Payslip> {
  return (await api.get<Payslip>(`/payslips/${id}/`)).data;
}
