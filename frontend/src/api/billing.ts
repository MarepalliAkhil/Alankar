import { api } from './client';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: string;
  amount: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  status_label: string;
  issued_at: string;
  service_name: string;
  visit_start: string | null;
  stylist_name: string | null;
  customer_name: string;
  subtotal: string;
  gst_amount: string;
  total: string;
  prepaid_amount: string;
  balance_paid: string;
  items: InvoiceItem[];
}

export async function listMyInvoices(): Promise<Invoice[]> {
  const { data } = await api.get<Invoice[]>('/my/invoices/');
  return data;
}

export interface PendingRating {
  id: string;
  service_name: string;
  visit_start: string | null;
  stylist_name: string | null;
}

export interface PendingRatings {
  count: number;
  results: PendingRating[];
  tags: string[];
}

export const PENDING_RATINGS_KEY = ['pending-ratings'];

export async function getPendingRatings(): Promise<PendingRatings> {
  const { data } = await api.get<PendingRatings>('/my/ratings/pending/');
  return data;
}

export interface RatingPayload {
  stars: number;
  comment: string;
  tags: string[];
}

export async function submitRating(
  id: string,
  payload: RatingPayload,
): Promise<{ detail: string; pending: number }> {
  const { data } = await api.post<{ detail: string; pending: number }>(
    `/my/ratings/${id}/`,
    payload,
  );
  return data;
}

/** True when the server refused a booking because a visit is still unrated. */
export function isRatingsPending(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })
    ?.response;
  return response?.status === 403 && response.data?.code === 'ratings_pending';
}
