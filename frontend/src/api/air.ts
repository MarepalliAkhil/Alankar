import { api } from './client';
import type { ChatAction } from './chatbot';

/**
 * AIR, the virtual receptionist inside the "AI Alankar Intelligence" chat (AIR Task 2).
 * Guests may ask general questions; booking and orders need a customer login. Staff get 403.
 * Nothing is booked or ordered by a message: only the Send request / Place order / confirm
 * buttons below create anything, and a booking is confirmed only after payment.
 */

export type AirPick = Record<string, string | number | boolean> & { kind: string };
export interface AirChip {
  label: string;
  pick: AirPick;
}
export interface BookingCard {
  type: 'booking';
  hold_id: string;
  service: string;
  option: string;
  price: string;
  gst_included: string;
  duration_minutes: number;
  stylist: string;
  start: string;
  when: string;
  held_until: string;
}
export interface OrderCardLine {
  product: string;
  name: string;
  quantity: number;
  amount: string;
}
export interface OrderCard {
  type: 'order';
  lines: OrderCardLine[];
  total: string;
  delivery_fee: string;
}
export type ConfirmKind = 'order' | 'order_update' | 'visit_product' | 'cancel_booking';
export interface ConfirmCard {
  type: 'confirm';
  kind: Exclude<ConfirmKind, 'order'>;
  label: string;
}
export interface CallbackCard {
  type: 'callback';
  note_id: string;
}
export type AirCard = BookingCard | OrderCard | ConfirmCard | CallbackCard;

export interface AirReply {
  text: string;
  intent: string;
  rephrased: string;
  show_rephrase: boolean;
  actions: ChatAction[];
  suggestions: string[];
  needs_login: boolean;
  source: string;
  chips: AirChip[];
  card: AirCard | null;
  wording_by_ai: boolean;
  mode: 'basic' | 'ai';
}
export interface AirAnswer {
  session_id: string;
  reply: AirReply;
  cover_active?: boolean;
}
export interface AirStatus {
  cover_active: boolean;
  ai_available: boolean;
  consent: 'granted' | 'none';
  consent_version: string;
  consent_text: string;
}
export interface AirConsent {
  granted: boolean;
  granted_at: string | null;
  withdrawn_at: string | null;
  version: string;
  current_version: string;
  text: string;
}

export async function airChat(input: {
  message?: string;
  pick?: AirPick;
  sessionId: string;
  basicMode: boolean;
}): Promise<AirAnswer> {
  const { data } = await api.post<AirAnswer>('/air/chat/', {
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.pick ? { pick: input.pick } : {}),
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    basic_mode: input.basicMode,
  });
  return data;
}

export async function airStatus(): Promise<AirStatus> {
  return (await api.get<AirStatus>('/air/status/')).data;
}

/** The ONLY way a chat booking request is created: the customer pressed Send request. */
export async function airSendRequest(holdId: string, sessionId: string): Promise<AirAnswer> {
  const { data } = await api.post<AirAnswer>('/my/air/send-request/', {
    hold_id: holdId,
    session_id: sessionId,
  });
  return data;
}

/** The customer pressed the button on an order / change / cancel card. */
export async function airConfirm(kind: ConfirmKind, sessionId: string): Promise<AirAnswer> {
  const { data } = await api.post<AirAnswer>('/my/air/confirm/', {
    kind,
    session_id: sessionId,
  });
  return data;
}

export async function getAirConsent(): Promise<AirConsent> {
  return (await api.get<AirConsent>('/my/air/consent/')).data;
}
export async function setAirConsent(granted: boolean): Promise<AirConsent> {
  return (await api.put<AirConsent>('/my/air/consent/', { granted })).data;
}

/** Receptionist: "talk to a person" notes left through the chat (no chat text is included). */
export interface CallbackNote {
  id: string;
  customer_name: string;
  customer_id: string;
  note: string;
  appointment_id: string | null;
  created_at: string;
}
export async function listCallbacks(): Promise<CallbackNote[]> {
  return (await api.get<{ results: CallbackNote[] }>('/desk/callbacks/')).data.results;
}
export async function markCallbackDone(id: string): Promise<void> {
  await api.post(`/desk/callbacks/${id}/done/`);
}
