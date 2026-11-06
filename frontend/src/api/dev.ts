import { api } from './client';

export interface OutboxMessage {
  id: string;
  kind: 'invite' | 'password_reset' | 'notice';
  to_email: string;
  subject: string;
  body: string;
  link: string;
  created_at: string;
}

/** Simulated email outbox. The server answers 404 unless SALON_DEBUG=true. */
export async function listMailbox(): Promise<OutboxMessage[]> {
  const { data } = await api.get<OutboxMessage[]>('/dev/mailbox/');
  return data;
}
