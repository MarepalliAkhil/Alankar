export const OPEN_CHAT_EVENT = 'alankar:open-chat';

/** Opens the corner chat from anywhere (the 404 page uses this). */
export function openChat(): void {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
