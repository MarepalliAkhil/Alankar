import { describe, expect, it } from 'vitest';
import { classifyError } from './client';

const httpError = (status?: number) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status },
});

describe('classifyError', () => {
  it('maps HTTP statuses to error kinds', () => {
    expect(classifyError(httpError())).toBe('network');
    expect(classifyError(httpError(400))).toBe('invalid');
    expect(classifyError(httpError(401))).toBe('unauthorized');
    expect(classifyError(httpError(403))).toBe('forbidden');
    expect(classifyError(httpError(404))).toBe('unavailable');
    expect(classifyError(httpError(409))).toBe('conflict');
    expect(classifyError(httpError(429))).toBe('rate_limited');
    expect(classifyError(httpError(500))).toBe('server');
  });

  it('treats non-HTTP errors as unknown', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
  });
});
