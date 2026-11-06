import { api } from './client';

/** Task 5e-3: purchase orders (admin). Stock changes only when goods are received. */

export type PoStatus = 'draft' | 'sent' | 'partly_received' | 'received' | 'closed' | 'cancelled';

export interface PoLine {
  id: string;
  product: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_cost: string;
  line_total: string;
  received: number;
  outstanding: number;
}
export interface PoReceipt {
  id: string;
  created_at: string;
  received_by: string;
  note: string;
  lines: { product_name: string; quantity: number }[];
}
export interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  supplier_name: string;
  status: PoStatus;
  status_label: string;
  expected_on: string | null;
  notes: string;
  created_at: string;
  sent_at: string | null;
  closed_at: string | null;
  close_reason: string;
  ordered_value: string;
  received_value: string;
  units_ordered: number;
  units_received: number;
  lines?: PoLine[];
  receipts?: PoReceipt[];
  emailed?: boolean;
}
export interface PoLineInput {
  product: string;
  quantity: number;
  unit_cost: string;
}
export interface PoInput {
  supplier: string;
  lines: PoLineInput[];
  expected_on: string | null;
  notes: string;
}
export interface SupplierHistory {
  supplier: { id: string; name: string };
  orders: PurchaseOrder[];
  summary: {
    orders: number;
    ordered_value: string;
    received_value: string;
    open: number;
    last_order: string | null;
  };
}

const P = '/admin/inventory/purchase-orders';

export async function listPurchaseOrders(supplier?: string): Promise<PurchaseOrder[]> {
  const { data } = await api.get<{ results: PurchaseOrder[] }>(`${P}/`, {
    params: supplier ? { supplier } : {},
  });
  return data.results;
}
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return (await api.get<PurchaseOrder>(`${P}/${id}/`)).data;
}
export async function createPurchaseOrder(body: PoInput): Promise<PurchaseOrder> {
  return (await api.post<PurchaseOrder>(`${P}/`, body)).data;
}
export async function updatePurchaseOrder(
  id: string,
  body: Partial<PoInput>,
): Promise<PurchaseOrder> {
  return (await api.patch<PurchaseOrder>(`${P}/${id}/`, body)).data;
}
export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return (await api.post<PurchaseOrder>(`${P}/${id}/send/`)).data;
}
export async function receivePurchaseOrder(
  id: string,
  items: { line: string; quantity: number }[],
  note: string,
): Promise<PurchaseOrder> {
  return (await api.post<PurchaseOrder>(`${P}/${id}/receive/`, { items, note })).data;
}
export async function closePurchaseOrder(id: string, reason: string): Promise<PurchaseOrder> {
  return (await api.post<PurchaseOrder>(`${P}/${id}/close/`, { reason })).data;
}
export async function getSupplierHistory(id: string): Promise<SupplierHistory> {
  return (await api.get<SupplierHistory>(`/admin/inventory/suppliers/${id}/history/`)).data;
}
