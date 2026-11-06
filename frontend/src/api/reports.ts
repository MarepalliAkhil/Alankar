import { api } from './client';

/** Task 5c: admin reports. The same endpoint gives the JSON for the screen and the CSV. */

export interface ReportColumn {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'money';
}
export type ReportRow = Record<string, string | number>;

export interface Report {
  key: string;
  label: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow;
  summary?: Record<string, string>;
  chart: { kind: 'bar' | 'heatmap'; x: string; y?: string; y2?: string; hours?: string[] };
}

export interface ReportName {
  key: string;
  label: string;
}

export interface Range {
  from: string;
  to: string;
}

export async function listReports(): Promise<ReportName[]> {
  return (await api.get<ReportName[]>('/admin/reports/')).data;
}
export async function getReport(name: string, range: Range): Promise<Report> {
  return (await api.get<Report>(`/admin/reports/${name}/`, { params: range })).data;
}
export async function downloadReport(name: string, range: Range): Promise<Blob> {
  const { data } = await api.get<Blob>(`/admin/reports/${name}/`, {
    params: { ...range, export: 'csv' },
    responseType: 'blob',
  });
  return data;
}
