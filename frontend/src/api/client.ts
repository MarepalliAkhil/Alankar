import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  changeRetrying,
  changeSlow,
  sleep,
  WAKE_MAX_MS,
  WAKE_RETRY_MS,
  WAKE_SLOW_MS,
  wakeEnabled,
  wakeRetryable,
} from './waking';

/**
 * Single HTTP client. Auth lives in httpOnly cookies set by the server; nothing is stored
 * in localStorage. Unsafe requests carry the CSRF token (csrftoken cookie -> X-CSRFToken).
 * In development Vite proxies /api to Django.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

/** Endpoints that must never trigger a silent session refresh. */
const NO_REFRESH = new Set([
  '/auth/csrf/',
  '/auth/session/',
  '/auth/login/',
  '/auth/register/',
  '/auth/otp/verify/',
  '/auth/otp/resend/',
  '/auth/refresh/',
  '/auth/logout/',
  '/auth/password-reset/',
  '/auth/password-reset/confirm/',
  '/auth/invite/',
  '/auth/invite/accept/',
]);

let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = api
      .post('/auth/refresh/')
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & {
  _retried?: boolean;
  _wakeStart?: number;
  _wakeTimer?: ReturnType<typeof setTimeout>;
  _wakeSlow?: boolean;
  _wakeRetrying?: boolean;
};

const DEFAULT_TIMEOUT = 15000;
const WAKE_TIMEOUT = 60000;

/** Free deployment only (src/api/waking.ts): note slow requests while the backend wakes. */
api.interceptors.request.use((request) => {
  const config = request as RetriableConfig;
  if (!wakeEnabled()) return request;
  config._wakeStart ??= Date.now();
  if (config.timeout === DEFAULT_TIMEOUT) config.timeout = WAKE_TIMEOUT;
  config._wakeTimer = setTimeout(() => {
    config._wakeSlow = true;
    changeSlow(1);
  }, WAKE_SLOW_MS);
  return request;
});

function settleWake(config: RetriableConfig | undefined, final: boolean) {
  if (!config) return;
  if (config._wakeTimer) clearTimeout(config._wakeTimer);
  config._wakeTimer = undefined;
  if (config._wakeSlow) {
    config._wakeSlow = false;
    changeSlow(-1);
  }
  if (final && config._wakeRetrying) {
    config._wakeRetrying = false;
    changeRetrying(-1);
  }
}

api.interceptors.response.use(
  (response) => {
    settleWake(response.config as RetriableConfig, true);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    settleWake(config, false);
    if (
      config &&
      wakeEnabled() &&
      wakeRetryable(config.method, error.response?.status, error.code) &&
      Date.now() - (config._wakeStart ?? Date.now()) < WAKE_MAX_MS
    ) {
      if (!config._wakeRetrying) {
        config._wakeRetrying = true;
        changeRetrying(1);
      }
      await sleep(WAKE_RETRY_MS);
      return api(config);
    }
    settleWake(config, true);
    return Promise.reject(error);
  },
);

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  if (
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !NO_REFRESH.has(config.url ?? '')
  ) {
    config._retried = true;
    if (await refreshSession()) return api(config);
    onSessionExpired?.();
  }
  return Promise.reject(error);
});

export type ApiErrorKind =
  | 'network'
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'server'
  | 'unknown';

export function classifyError(error: unknown): ApiErrorKind {
  if (!axios.isAxiosError(error)) return 'unknown';
  const status = error.response?.status;
  if (status === undefined) return 'network';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 405 || status === 501 || status === 502 || status === 503) return 'unavailable';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** The server's `detail` message, if any. */
export function errorDetail(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data as { detail?: unknown } | undefined;
  return typeof data?.detail === 'string' ? data.detail : undefined;
}

/** Field errors from a 400 response, first message per field. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return {};
  const data = error.response.data;
  const out: Record<string, string> = {};
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === 'detail') continue;
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') out[key] = first;
    }
  }
  return out;
}
