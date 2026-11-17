/**
 * The free deployment (docs/DEPLOY_FREE.md): the backend on Render sleeps after 15 minutes without
 * traffic and takes up to a minute to wake. While it wakes, requests are slow or the Vercel rewrite
 * answers 502/503/504. Instead of an error, the app shows the LogoLoader with a short message and
 * retries automatically.
 *
 * Switched on only when the site is built for the free deployment (VITE_WS_ORIGIN is set); local,
 * Docker and Azure behave exactly as before.
 */

export const WAKE_SLOW_MS = 4000; // a request slower than this shows the message
export const WAKE_RETRY_MS = 3000; // pause between retries
export const WAKE_MAX_MS = 90000; // give up (normal error) after this long

let enabledOverride: boolean | null = null;
let slow = 0;
let retrying = 0;
const listeners = new Set<(on: boolean) => void>();

export function wakeEnabled(): boolean {
  if (enabledOverride !== null) return enabledOverride;
  return Boolean(import.meta.env.VITE_WS_ORIGIN);
}

/** Tests only. */
export function setWakeEnabledForTests(on: boolean | null): void {
  enabledOverride = on;
  slow = 0;
  retrying = 0;
  emit();
}

export function isWaking(): boolean {
  return slow + retrying > 0;
}

function emit() {
  const on = isWaking();
  for (const listener of listeners) listener(on);
}

export function subscribeWaking(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function changeSlow(delta: 1 | -1): void {
  slow = Math.max(0, slow + delta);
  emit();
}

export function changeRetrying(delta: 1 | -1): void {
  retrying = Math.max(0, retrying + delta);
  emit();
}

const SAFE = new Set(['get', 'head', 'options']);

/**
 * Is this failure the server waking up, and is it safe to send the request again?
 * GET/HEAD/OPTIONS: retried on 502, 503, 504 and on a timeout. Anything that changes data: only on
 * 502 and 503 (the request never reached Django), never on 504 or a timeout (it might have).
 */
export function wakeRetryable(
  method: string | undefined,
  status: number | undefined,
  code?: string,
) {
  const safe = SAFE.has((method ?? 'get').toLowerCase());
  if (status === 502 || status === 503) return true;
  if (status === 504 || (status === undefined && code === 'ECONNABORTED')) return safe;
  return false;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
