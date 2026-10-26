import axios from 'axios';

/**
 * Single HTTP client. Cookies carry auth (httpOnly, set by the server in Task 1);
 * tokens are never stored in localStorage. In development Vite proxies /api to Django.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

export type ApiErrorKind =
  | 'network'
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
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
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 405 || status === 501 || status === 502 || status === 503)
    return 'unavailable';
  if (status >= 500) return 'server';
  return 'unknown';
}
