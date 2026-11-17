import { useSyncExternalStore } from 'react';
import { isWaking, subscribeWaking } from '../../api/waking';
import { LogoLoader } from './LogoLoader';

export const WAKING_TEXT = 'Waking up the server, this can take up to a minute';

/**
 * Free deployment only: while the sleeping backend wakes up (src/api/waking.ts), a calm full-page
 * LogoLoader with one line of text instead of an error. Requests are retried underneath.
 */
export function WakingOverlay() {
  const waking = useSyncExternalStore(subscribeWaking, isWaking, () => false);
  if (!waking) return null;
  return (
    <div
      className="fixed inset-0 z-overlay grid place-items-center bg-background"
      data-testid="waking-overlay"
    >
      <div className="flex flex-col items-center gap-sm px-md text-center">
        <LogoLoader size="medium" label={WAKING_TEXT} />
        <p className="text-sm text-text-muted">{WAKING_TEXT}</p>
      </div>
    </div>
  );
}
