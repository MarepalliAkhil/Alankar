import { api } from './client';

/** Task 14b: the admin shop statistics. One request gives the whole dashboard. */

export type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface StatsQuery {
  preset: Preset;
  from?: string;
  to?: string;
}

/** A number with the same number for the period before and the change in percent. */
export interface Kpi<T = number | string | null> {
  value: T;
  previous: T;
  change_pct: number | null;
}

export type KpiKey =
  | 'revenue_total'
  | 'revenue_services'
  | 'revenue_products'
  | 'revenue_tips'
  | 'revenue_packages'
  | 'revenue_memberships'
  | 'bills'
  | 'average_bill'
  | 'bookings'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'average_rating'
  | 'ratings'
  | 'utilization_pct'
  | 'new_customers'
  | 'returning_customers'
  | 'acceptance_pct'
  | 'desk_minutes'
  | 'stylist_minutes'
  | 'decision_minutes';

export interface StatsColumn {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'money';
}
export type StatsRow = Record<string, string | number | null>;

export interface StatsTable {
  columns: StatsColumn[];
  rows: StatsRow[];
  totals?: StatsRow;
  hours?: string[];
  busiest?: string | null;
}

export type TableKey =
  | 'revenue_streams'
  | 'bookings_by_status'
  | 'revenue_trend'
  | 'bookings_per_day'
  | 'busiest_hours'
  | 'revenue_by_service'
  | 'top_stylists'
  | 'utilization'
  | 'top_products'
  | 'low_stock'
  | 'coupons'
  | 'payroll';

export interface RequestStats {
  requests: number;
  accepted: number;
  declined: number;
  expired: number;
  open: number;
  acceptance_pct: number | null;
  decision_minutes: number | null;
  desk_minutes: number | null;
  stylist_minutes: number | null;
}

export interface ShopStats {
  period: {
    preset: Preset;
    from: string;
    to: string;
    previous_from: string;
    previous_to: string;
    days: number;
  };
  generated_at: string;
  kpis: Record<KpiKey, Kpi>;
  details: {
    bookings_total: number;
    requests: RequestStats;
    revenue_extra: {
      bills: number;
      refunds_paid: string;
      online_orders: number;
      online_orders_total: string;
    };
    offers: {
      coupons: { uses: number; given: string };
      packages: { sold: number; net: string; sessions_used: number };
      memberships: {
        sold: number;
        net: string;
        joined: number;
        renewed: number;
        cancelled: number;
        ended: number;
        active_now: number;
      };
    };
  };
  tables: Record<TableKey, StatsTable>;
}

export async function getShopStats(query: StatsQuery): Promise<ShopStats> {
  const params = query.preset === 'custom' ? query : { preset: query.preset };
  return (await api.get<ShopStats>('/admin/stats/', { params })).data;
}

export async function downloadStatsTable(query: StatsQuery, table: TableKey): Promise<Blob> {
  const params = query.preset === 'custom' ? query : { preset: query.preset };
  return (
    await api.get<Blob>('/admin/stats/', {
      params: { ...params, table, export: 'csv' },
      responseType: 'blob',
    })
  ).data;
}
