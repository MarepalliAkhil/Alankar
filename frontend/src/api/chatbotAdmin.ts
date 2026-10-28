import { api } from './client';
import type { ChatReply } from './chatbot';

/** Task 7c: admin Chatbot insights. Anonymous keys and counts only. */

export type QuestionStatus = 'open' | 'answered' | 'dismissed';

export interface UnansweredRow {
  id: number;
  key: string;
  count: number;
  first_seen: string;
  last_seen: string;
  status: QuestionStatus;
}
export interface UsageRow {
  intent: string;
  count: number;
}
export interface UndescribedService {
  id: string;
  name: string;
  division: string;
}
export interface Insights {
  services_without_description: UndescribedService[];
  days: number;
  total_questions: number;
  unanswered_questions: number;
  unanswered: UnansweredRow[];
  usage: UsageRow[];
}

export async function getInsights(status: QuestionStatus = 'open'): Promise<Insights> {
  const { data } = await api.get<Insights>('/admin/chatbot/insights/', { params: { status } });
  return data;
}
export async function addAsFaq(id: number, input: { question: string; answer: string }) {
  const { data } = await api.post(`/admin/chatbot/unanswered/${id}/faq/`, input);
  return data;
}
export async function dismissQuestion(id: number) {
  const { data } = await api.post(`/admin/chatbot/unanswered/${id}/dismiss/`);
  return data;
}
export async function testQuestion(message: string): Promise<ChatReply> {
  const { data } = await api.post<ChatReply>('/admin/chatbot/test/', { message });
  return data;
}
