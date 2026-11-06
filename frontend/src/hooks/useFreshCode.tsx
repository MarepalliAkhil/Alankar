import { useCallback, useRef, useState, type ReactNode } from 'react';
import { needsFreshCode } from '../api/trustedDevices';
import { FreshCodeModal } from '../components/auth/FreshCodeModal';

/**
 * Wrap a sensitive request in `guard`. If the server asks for a fresh code, a dialog collects it
 * and the request is tried once more. Render `modal` somewhere in the component.
 */
export function useFreshCode(): {
  guard: <T>(action: () => Promise<T>) => Promise<T>;
  modal: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const waiting = useRef<{ done: () => void; stop: (reason: Error) => void } | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiting.current = { done: resolve, stop: reject };
        setOpen(true);
      }),
    [],
  );

  const guard = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (error) {
        if (!needsFreshCode(error)) throw error;
        await ask();
        return action();
      }
    },
    [ask],
  );

  const modal = open ? (
    <FreshCodeModal
      onVerified={() => {
        setOpen(false);
        waiting.current?.done();
      }}
      onCancel={() => {
        setOpen(false);
        waiting.current?.stop(new Error('Cancelled'));
      }}
    />
  ) : null;
  return { guard, modal };
}
