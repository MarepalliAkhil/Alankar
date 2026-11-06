import { api } from './client';

/** Task 7: AI Alankar Intelligence. Guests and customers only; the server refuses staff accounts. */

export interface ChatAction {
  label: string;
  url: string;
}
export interface ChatReply {
  text: string;
  intent: string;
  rephrased: string;
  show_rephrase: boolean;
  actions: ChatAction[];
  suggestions: string[];
  needs_login: boolean;
  source: 'intent' | 'kb' | 'followup' | 'clarify' | 'fallback' | 'entity';
}
export interface ChatAnswer {
  session_id: string;
  reply: ChatReply;
}

export async function askChatbot(message: string, sessionId: string): Promise<ChatAnswer> {
  const { data } = await api.post<ChatAnswer>('/chatbot/ask/', {
    message,
    ...(sessionId ? { session_id: sessionId } : {}),
  });
  return data;
}
