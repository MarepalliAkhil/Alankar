/** The Zen Chat conversation page for each chat role. */
export function chatPathFor(role: 'customer' | 'stylist', thread: string): string {
  return role === 'customer' ? `/customer/chat/${thread}` : `/chat/${thread}`;
}
