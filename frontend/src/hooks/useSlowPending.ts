import { useEffect, useState } from 'react';

/** How long an action may run before the busy overlay appears over its form or card. */
export const SLOW_ACTION_MS = 800;

/**
 * True once `pending` has been true for `delay` ms (and false again the moment it ends), so quick
 * actions only show the button spinner and slow ones also get the busy overlay.
 */
export function useSlowPending(pending: boolean, delay = SLOW_ACTION_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), delay);
    return () => window.clearTimeout(timer);
  }, [pending, delay]);
  return pending && slow;
}
