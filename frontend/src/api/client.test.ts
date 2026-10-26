import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, classifyError, serverFieldErrors, setSessionExpiredHandler } from './client';

const httpError = (status?: number, data?: unknown) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status, data },
});

function respond(config: InternalAxiosRequestConfig, status: number): Promise<AxiosResponse> {
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse;
  if (status >= 400) {
    return Promise.reject(
      Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, config, response }),
    );
  }
  return Promise.resolve(response);
}

describe('classifyError', () => {
  it('maps HTTP statuses to error kinds', () => {
    expect(classifyError(httpError())).toBe('network');
    expect(classifyError(httpError(400))).toBe('invalid');
    expect(classifyError(httpError(401))).toBe('unauthorized');
    expect(classifyError(httpError(403))).toBe('forbidden');
    expect(classifyError(httpError(404))).toBe('not_found');
    expect(classifyError(httpError(409))).toBe('conflict');
    expect(classifyError(httpError(429))).toBe('rate_limited');
    expect(classifyError(httpError(503))).toBe('unavailable');
    expect(classifyError(httpError(500))).toBe('server');
  });

  it('treats non-HTTP errors as unknown', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
  });

  it('reads field errors from a 400 body', () => {
    expect(serverFieldErrors(httpError(400, { phone: ['Bad number.'], detail: 'x' }))).toEqual({
      phone: 'Bad number.',
    });
    expect(serverFieldErrors(httpError(500, { phone: ['x'] }))).toEqual({});
  });
});

describe('silent session refresh', () => {
  const original = api.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = original;
    setSessionExpiredHandler(null);
  });

  it('refreshes once on 401 and retries the request', async () => {
    const calls: string[] = [];
    let meCalls = 0;
    api.defaults.adapter = ((config) => {
      calls.push(config.url ?? '');
      if (config.url === '/auth/refresh/') return respond(config, 204);
      meCalls += 1;
      return respond(config, meCalls === 1 ? 401 : 200);
    }) as AxiosAdapter;
    const response = await api.get('/auth/me/');
    expect(response.status).toBe(200);
    expect(calls).toEqual(['/auth/me/', '/auth/refresh/', '/auth/me/']);
  });

  it('reports an expired session when refresh fails', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    api.defaults.adapter = ((config) => respond(config, 401)) as AxiosAdapter;
    await expect(api.get('/staff/')).rejects.toBeTruthy();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('never refreshes for the login call itself', async () => {
    const calls: string[] = [];
    api.defaults.adapter = ((config) => {
      calls.push(config.url ?? '');
      return respond(config, 401);
    }) as AxiosAdapter;
    await expect(api.post('/auth/login/', {})).rejects.toBeTruthy();
    expect(calls).toEqual(['/auth/login/']);
  });
});
