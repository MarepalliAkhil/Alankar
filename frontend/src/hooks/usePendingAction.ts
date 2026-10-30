import { useCallback, useRef, useState } from 'react';

/**
 * For actions that are not react-query mutations (sign out, resend a code): wraps an async
 * function so the button can show `loading={pending}`. A second call while one is running is
 * ignored (no double submit). Errors are passed on to the caller unchanged.
 */
export function usePendingAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
): [(...args: Args) => Promise<R | undefined>, boolean] {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const run = useCallback(
    async (...args: Args) => {
      if (running.current) return undefined;
      running.current = true;
      setPending(true);
      try {
        return await action(...args);
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [action],
  );
  return [run, pending];
}
