import { api } from './client';

/** Task 9: the For Zenotians page content (public read; edited in the admin content editor). */

export type ContactKey = 'email' | 'linkedin' | 'github' | 'portfolio' | 'phone';

export interface Overview {
  headline?: string;
  intro?: string;
  start_here?: string[];
  demo_url?: string;
  github_url?: string;
  resume_pdf_url?: string;
}
export interface Contact {
  key: ContactKey;
  label?: string;
  value: string;
  public: boolean;
}
export interface Education {
  school?: string;
  place?: string;
  period?: string;
  program?: string;
  result?: string;
}
export interface ResumeProject {
  title?: string;
  url?: string;
  tech?: string;
  note?: string;
  bullets?: string[];
  outcome?: string;
}
export interface Experience {
  role?: string;
  org?: string;
  period?: string;
  bullets?: string[];
}
export interface SkillGroup {
  group?: string;
  items?: string[];
}
export interface Certification {
  title?: string;
  detail?: string;
  url?: string;
}
export interface ResumeAchievement {
  title?: string;
  detail?: string;
}
export interface Resume {
  name?: string;
  location?: string;
  contacts?: Contact[];
  summary?: string;
  education?: Education[];
  projects?: ResumeProject[];
  experience?: Experience[];
  skills?: SkillGroup[];
  certifications?: Certification[];
  achievements?: ResumeAchievement[];
  pdf_url?: string;
}
export interface Person {
  name: string;
  title: string;
}
export interface Zenoti {
  label?: string;
  last_checked?: string | null;
  founded_year?: number | null;
  founded_text?: string;
  founded_source?: string;
  customers_text?: string;
  customers_note?: string;
  customers_source?: string;
  leadership?: Person[];
  leadership_source?: string;
  offices?: string[];
  offices_source?: string;
  investors?: string[];
  investors_source?: string;
}
export interface RoleInfo {
  role?: string;
  does?: string[];
}
export interface StackRow {
  layer?: string;
  items?: string[];
}
export interface ProjectInfo {
  intro?: string;
  roles?: RoleInfo[];
  stack?: StackRow[];
  security?: string[];
}
export interface MappingRow {
  workflow?: string;
  built?: string;
  not_built?: string;
}
export interface Decision {
  title?: string;
  body?: string;
  where?: string[];
}
export interface FlowRole {
  role?: string;
  data_in?: string[];
  today?: string[];
  future?: string[];
  guardrails?: string[];
}
export interface Vision {
  intro?: string;
  roles?: FlowRole[];
  overview_note?: string;
}
export interface DemoLogin {
  role: 'customer' | 'receptionist' | 'stylist' | 'admin';
  email: string;
  password: string;
}
export interface Demo {
  logins?: DemoLogin[];
  guide?: string[];
}

export interface ZenotiansContent {
  overview?: Overview;
  resume?: Resume;
  zenoti?: Zenoti;
  project?: ProjectInfo;
  mapping?: MappingRow[];
  decisions?: Decision[];
  vision?: Vision;
  demo?: Demo;
}

export async function getZenotians(): Promise<ZenotiansContent> {
  const { data } = await api.get<ZenotiansContent>('/public/zenotians/');
  return data;
}
