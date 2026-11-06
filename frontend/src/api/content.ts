import { api } from './client';
import type { ZenotiansContent } from './zenotians';

export type { ZenotiansContent };

/** Task 5c: the admin's public-content editor (drafts, preview, publish). */

export type BlockKey = 'hero' | 'about' | 'announcements' | 'zenotians';

export interface HeroContent {
  headline: string;
  subtitle: string;
  image_url?: string;
  cta_label?: string;
}
export interface AboutContent {
  heading: string;
  body: string;
  image_url?: string;
}
export interface AnnouncementItem {
  text: string;
  link?: string;
  starts?: string | null;
  ends?: string | null;
}
export interface AnnouncementsContent {
  items: AnnouncementItem[];
}
export interface BlockValues {
  hero: HeroContent;
  about: AboutContent;
  announcements: AnnouncementsContent;
  zenotians: ZenotiansContent;
}

export interface ContentBlock<K extends BlockKey = BlockKey> {
  key: K;
  label: string;
  can_unpublish: boolean;
  published: Partial<BlockValues[K]>;
  draft: BlockValues[K] | null;
  has_draft: boolean;
  is_published: boolean;
  published_at: string | null;
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
  tags: string[];
  show_in_faq: boolean;
  published: boolean;
  is_active: boolean;
  sort_order: number;
}
export type FaqInput = Partial<
  Pick<Faq, 'question' | 'answer' | 'tags' | 'show_in_faq' | 'sort_order'>
> & {
  is_active?: boolean;
};

export interface Achievement {
  id: number;
  label: string;
  value: number;
  suffix: string;
  sort_order: number;
  is_active: boolean;
}
export type AchievementInput = Partial<Omit<Achievement, 'id'>>;

export interface ContentPreview {
  hero: Partial<HeroContent>;
  about: Partial<AboutContent>;
  announcements: AnnouncementsContent;
  zenotians: ZenotiansContent;
  faqs: Faq[];
  achievements: Achievement[];
}

const C = '/admin/content';

export async function listBlocks(): Promise<ContentBlock[]> {
  const { data } = await api.get<{ blocks: ContentBlock[] }>(`${C}/`);
  return data.blocks;
}
export async function getPreview(): Promise<ContentPreview> {
  const { data } = await api.get<ContentPreview>(`${C}/preview/`);
  return data;
}
export async function saveDraft<K extends BlockKey>(key: K, body: BlockValues[K]) {
  const { data } = await api.put<ContentBlock<K>>(`${C}/${key}/`, body);
  return data;
}
export async function discardDraft(key: BlockKey) {
  const { data } = await api.delete<ContentBlock>(`${C}/${key}/`);
  return data;
}
export async function publishBlock(key: BlockKey) {
  const { data } = await api.post<ContentBlock>(`${C}/${key}/`);
  return data;
}
export async function unpublishBlock(key: BlockKey) {
  const { data } = await api.post<ContentBlock>(`${C}/${key}/unpublish/`);
  return data;
}

export async function listFaqs(): Promise<Faq[]> {
  const { data } = await api.get<Faq[]>(`${C}/faqs/`);
  return data;
}
export async function createFaq(body: FaqInput): Promise<Faq> {
  const { data } = await api.post<Faq>(`${C}/faqs/`, body);
  return data;
}
export async function updateFaq(id: number, body: FaqInput): Promise<Faq> {
  const { data } = await api.patch<Faq>(`${C}/faqs/${id}/`, body);
  return data;
}
export async function deleteFaq(id: number): Promise<void> {
  await api.delete(`${C}/faqs/${id}/`);
}

export async function listAchievements(): Promise<Achievement[]> {
  const { data } = await api.get<Achievement[]>(`${C}/achievements/`);
  return data;
}
export async function createAchievement(body: AchievementInput): Promise<Achievement> {
  const { data } = await api.post<Achievement>(`${C}/achievements/`, body);
  return data;
}
export async function updateAchievement(id: number, body: AchievementInput): Promise<Achievement> {
  const { data } = await api.patch<Achievement>(`${C}/achievements/${id}/`, body);
  return data;
}
export async function deleteAchievement(id: number): Promise<void> {
  await api.delete(`${C}/achievements/${id}/`);
}
