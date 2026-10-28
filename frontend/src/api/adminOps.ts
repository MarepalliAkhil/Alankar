import { api } from './client';

/** Task 5b: admin inventory, cash-close review and business settings. */

export interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_price: string;
  gst_percent: string;
  low_stock_level: number;
  is_active: boolean;
  stock: number;
  low: boolean;
}

export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  unit_price: string;
  gst_percent: string;
  low_stock_level: number;
  is_active: boolean;
  opening_stock?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  notes: string;
  is_active: boolean;
  movement_count: number;
}

export type SupplierInput = Partial<Omit<Supplier, 'id' | 'movement_count'>>;

export interface Movement {
  id: string;
  product: string;
  product_name: string;
  sku: string;
  delta: number;
  reason: string;
  reason_label: string;
  note: string;
  supplier: string;
  actor: string;
  invoice: string;
  created_at: string;
}

export type MovementKind = 'receive' | 'adjust' | 'wastage';

const INV = '/admin/inventory';

export async function listProducts(): Promise<{ low_count: number; results: AdminProduct[] }> {
  const { data } = await api.get(`${INV}/products/`);
  return data;
}
export async function createProduct(body: ProductInput): Promise<AdminProduct> {
  const { data } = await api.post<AdminProduct>(`${INV}/products/`, body);
  return data;
}
export async function updateProduct(id: string, body: Partial<ProductInput>) {
  const { data } = await api.patch<AdminProduct>(`${INV}/products/${id}/`, body);
  return data;
}
export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`${INV}/products/${id}/`);
}
export async function moveStock(
  id: string,
  body: { kind: MovementKind; quantity: number; supplier?: string | null; note?: string },
): Promise<{ movement: Movement; product: AdminProduct }> {
  const { data } = await api.post(`${INV}/products/${id}/stock/`, body);
  return data;
}
export async function getLedger(product?: string): Promise<Movement[]> {
  const { data } = await api.get<{ results: Movement[] }>(`${INV}/ledger/`, {
    params: product ? { product } : {},
  });
  return data.results;
}
export async function listSuppliers(): Promise<Supplier[]> {
  const { data } = await api.get<Supplier[]>(`${INV}/suppliers/`);
  return data;
}
export async function createSupplier(body: SupplierInput): Promise<Supplier> {
  const { data } = await api.post<Supplier>(`${INV}/suppliers/`, body);
  return data;
}
export async function updateSupplier(id: string, body: SupplierInput): Promise<Supplier> {
  const { data } = await api.patch<Supplier>(`${INV}/suppliers/${id}/`, body);
  return data;
}
export async function deleteSupplier(id: string): Promise<void> {
  await api.delete(`${INV}/suppliers/${id}/`);
}

// ------------------------------------------------------------------------- cash closes

export interface CashCloseRow {
  id: string;
  date: string;
  expected_cash: string;
  expected_card: string;
  expected_upi: string;
  counted_cash: string;
  difference: string;
  invoice_count: number;
  note: string;
  closed_by: string;
  closed_at: string;
  reviewed: boolean;
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
}

export interface CashCloseList {
  waiting: number;
  waiting_with_difference: number;
  results: CashCloseRow[];
}

export async function listCashCloses(): Promise<CashCloseList> {
  const { data } = await api.get<CashCloseList>('/admin/cash-closes/');
  return data;
}
export async function reviewCashClose(id: string, note: string): Promise<CashCloseRow> {
  const { data } = await api.post<CashCloseRow>(`/admin/cash-closes/${id}/review/`, { note });
  return data;
}

// ------------------------------------------------------------------------------ settings

export type WeeklyHours = Record<string, [string, string] | null>;

export interface BusinessSettings {
  shop: { address: string; phone: string; email: string; map_url: string; gst_number: string };
  hours: { weekly_hours: WeeklyHours };
  booking: { free_cancel_hours: number; hold_hours: number; waitlist_offer_minutes: number };
  billing: { discount_cap_percent: number };
  security: { idle_minutes: number; late_grace_minutes: number };
  rating: {
    min_ratings: number;
    flag_below: string;
    bands: { min_average: string; multiplier: string }[];
  };
}

export type SettingsPatch = Partial<{
  [K in keyof BusinessSettings]: Partial<BusinessSettings[K]>;
}>;

export async function getSettings(): Promise<BusinessSettings> {
  const { data } = await api.get<BusinessSettings>('/admin/settings/');
  return data;
}
export async function saveSettings(patch: SettingsPatch): Promise<BusinessSettings> {
  const { data } = await api.patch<BusinessSettings>('/admin/settings/', patch);
  return data;
}
