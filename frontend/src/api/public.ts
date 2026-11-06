import type { DivisionId } from '../config/divisions';
import { api } from './client';

export type Audience = 'men' | 'women' | 'kids' | 'unisex';

export interface PriceOption {
  id: string;
  label: string;
  price: string;
  duration_minutes: number;
}

export interface Service {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  division: DivisionId;
  category: { name: string; slug: string };
  audience: Audience;
  from_price: string;
  min_duration: number;
  max_duration: number;
  image_url: string;
  tags: string[];
  variants: PriceOption[];
  addons: PriceOption[];
}

export interface Category {
  id: string;
  division: DivisionId;
  name: string;
  slug: string;
  service_count: number;
}

export interface TeamMember {
  id: string;
  display_name: string;
  title: string;
  specialization: string;
  bio: string;
  photo_url: string;
  divisions: DivisionId[];
  rating: number | null;
}

export interface SiteData {
  hero: { headline?: string; subtitle?: string; image_url?: string; cta_label?: string } | null;
  about: { heading?: string; body?: string; image_url?: string } | null;
  /** Notices that are live today (the server filters by date). */
  announcements?: { text: string; link: string }[];
  contact: {
    address?: string;
    phone?: string;
    email?: string;
    map_url?: string;
    gst_number?: string;
  } | null;
  hours: { days: string; open: string; close: string; closed?: boolean }[] | null;
  social: { label: string; url: string }[] | null;
  video: { url?: string } | null;
  achievements: { id: number; label: string; value: number; suffix: string }[];
  offers: {
    id: number;
    title: string;
    description: string;
    badge: string;
    valid_until: string | null;
  }[];
  faqs: { id: number; question: string; answer: string }[];
  stats: { services: number; team: number; divisions: Record<DivisionId, number> };
  policies: { key: PolicyKey; title: string }[];
}

export type PolicyKey = 'privacy' | 'terms' | 'cancellation';

export interface ServiceFilters {
  division?: DivisionId;
  audience?: Audience;
  category?: string;
  q?: string;
}

export async function getSite(): Promise<SiteData> {
  const { data } = await api.get<SiteData>('/public/site/');
  return data;
}

export async function getCategories(division: DivisionId): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/public/categories/', { params: { division } });
  return data;
}

export async function getServices(filters: ServiceFilters): Promise<Service[]> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => !!value));
  const { data } = await api.get<Service[]>('/public/services/', { params });
  return data;
}

export async function getTeam(division?: DivisionId): Promise<TeamMember[]> {
  const { data } = await api.get<TeamMember[]>('/public/team/', {
    params: division ? { division } : {},
  });
  return data;
}

export async function getPolicyPage(
  key: PolicyKey,
): Promise<{ key: PolicyKey; title: string; body: string }> {
  const { data } = await api.get<{ key: PolicyKey; title: string; body: string }>(
    `/public/pages/${key}/`,
  );
  return data;
}
