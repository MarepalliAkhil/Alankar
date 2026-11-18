/** Free deployment (docs/DEPLOY_FREE.md): waking backend, chat tickets, vercel.json. */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkVercel, PLACEHOLDER } from '../../scripts/vercel-build.mjs';
import { WAKING_TEXT, WakingOverlay } from '../components/brand/WakingOverlay';
import { useChat } from '../hooks/useChat';
import { PRIVATE_PREFIXES } from '../seo/seo-data.js';
import { api } from './client';
import { isWaking, setWakeEnabledForTests, wakeRetryable } from './waking';

vi.mock('./chat', () => ({
  getHistory: vi.fn(() => Promise.resolve({ messages: [] })),
  sendViaRest: vi.fn(),
  markRead: vi.fn(),
  sendPhoto: vi.fn(),
  socketUrl: (id: string) => `ws://same-origin/api/ws/chat/${id}/`,
}));

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}) {
  const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse;
  if (status >= 400) {
    return Promise.reject(
      Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, config, response }),
    );
  }
  return Promise.resolve(response);
}

describe('waking backend', () => {
  const original = api.defaults.adapter;
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    api.defaults.adapter = original;
    setWakeEnabledForTests(null);
    vi.useRealTimers();
  });

  it('decides what is safe to send again', () => {
    expect(wakeRetryable('get', 504)).toBe(true);
    expect(wakeRetryable('get', undefined, 'ECONNABORTED')).toBe(true);
    expect(wakeRetryable('post', 502)).toBe(true);
    expect(wakeRetryable('post', 503)).toBe(true);
    expect(wakeRetryable('post', 504)).toBe(false); // it may have reached the server
    expect(wakeRetryable('post', undefined, 'ECONNABORTED')).toBe(false);
    expect(wakeRetryable('get', 500)).toBe(false);
    expect(wakeRetryable('get', 404)).toBe(false);
  });

  it('shows the loader and retries until the server answers', async () => {
    setWakeEnabledForTests(true);
    render(<WakingOverlay />);
    let calls = 0;
    api.defaults.adapter = ((config) => {
      calls += 1;
      return respond(config, calls < 3 ? 503 : 200, { ok: true });
    }) as AxiosAdapter;
    const pending = api.get('/public/site/');
    await waitFor(() => expect(screen.getByText(WAKING_TEXT)).toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(3);
    await waitFor(() => expect(screen.queryByText(WAKING_TEXT)).not.toBeInTheDocument());
    expect(isWaking()).toBe(false);
  });

  it('shows the loader for a slow answer too', async () => {
    setWakeEnabledForTests(true);
    render(<WakingOverlay />);
    let finish: () => void = () => undefined;
    api.defaults.adapter = ((config) =>
      new Promise<AxiosResponse>((resolve) => {
        finish = () => resolve({ data: {}, status: 200, statusText: '', headers: {}, config });
      })) as AxiosAdapter;
    const pending = api.get('/auth/session/');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(screen.getByText(WAKING_TEXT)).toBeInTheDocument();
    finish();
    await pending;
    await waitFor(() => expect(screen.queryByText(WAKING_TEXT)).not.toBeInTheDocument());
  });

  it('gives up after the time limit with the normal error', async () => {
    setWakeEnabledForTests(true);
    api.defaults.adapter = ((config) => respond(config, 502)) as AxiosAdapter;
    const pending = api.get('/public/site/').catch((e: unknown) => e);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100000);
    });
    expect(await pending).toMatchObject({ response: { status: 502 } });
    expect(isWaking()).toBe(false);
  });

  it('changes nothing outside the free deployment', async () => {
    setWakeEnabledForTests(false);
    let calls = 0;
    api.defaults.adapter = ((config) => {
      calls += 1;
      return respond(config, 503);
    }) as AxiosAdapter;
    await expect(api.get('/public/site/')).rejects.toBeTruthy();
    expect(calls).toBe(1);
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  drop(code = 1006) {
    this.readyState = 3;
    act(() => this.onclose?.({ code }));
  }
}

describe('chat sockets on the free deployment', () => {
  const original = api.defaults.adapter;
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    api.defaults.adapter = original;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses the same-origin cookie socket when VITE_WS_ORIGIN is not set', async () => {
    vi.stubEnv('VITE_WS_ORIGIN', '');
    renderHook(() => useChat('th1'));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    expect(FakeSocket.instances[0].url).toBe('ws://same-origin/api/ws/chat/th1/');
  });

  it('fetches a new ticket for every connection to the Render host', async () => {
    vi.stubEnv('VITE_WS_ORIGIN', 'wss://alankar-api.onrender.com/');
    let n = 0;
    const urls: string[] = [];
    api.defaults.adapter = ((config) => {
      urls.push(config.url ?? '');
      n += 1;
      return respond(config, 200, { ticket: `t${n}`, expires_in: 30 });
    }) as AxiosAdapter;
    renderHook(() => useChat('th1'));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    expect(FakeSocket.instances[0].url).toBe(
      'wss://alankar-api.onrender.com/api/ws/chat/th1/?ticket=t1',
    );
    FakeSocket.instances[0].drop(1006);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(FakeSocket.instances[1].url).toContain('?ticket=t2');
    expect(urls).toEqual(['/ws-ticket/', '/ws-ticket/']);
  });
});

const ROOT = process.cwd();
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  framework: string;
  buildCommand: string;
  outputDirectory: string;
  redirects: { source: string; destination: string; permanent: boolean }[];
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const GOOD_ENV = {
  SITE_URL: 'https://alankar.vercel.app',
  VITE_WS_ORIGIN: 'wss://alankar-api.onrender.com',
};
// The same file with the backend address as the placeholder and as a real address.
const withHost = (host: string) => ({
  ...vercel,
  rewrites: vercel.rewrites.map((r, i) =>
    i === 0 ? { ...r, destination: r.destination.replace(/\/\/[^/]+\//, `//${host}/`) } : r,
  ),
});
const placeholder = withHost(`${PLACEHOLDER}.onrender.com`);
const real = withHost('alankar-api.onrender.com');

describe('vercel.json', () => {
  it('builds the Vite app into dist with the checked build command', () => {
    expect(vercel.framework).toBe('vite');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.buildCommand).toBe('npm run build:vercel');
  });

  it('sends /api to Render, written in one place, keeping trailing slashes', () => {
    const [first] = vercel.rewrites;
    expect(first.source).toBe('/api/:path(.*)');
    expect(first.destination).toMatch(/^https:\/\/[^/]+\.onrender\.com\/api\/:path$/);
    expect(JSON.stringify(vercel).match(/https:\/\/[^"*]*onrender\.com/g)).toHaveLength(1);
  });

  it('opens every signed-in area in the app and redirects the old addresses', () => {
    const areas = PRIVATE_PREFIXES.filter((p) => p !== '/api/').map((p) =>
      p.replace(/^\/|\/$/g, ''),
    );
    const all = vercel.rewrites
      .slice(1)
      .map((r) => r.source)
      .join(' ');
    for (const area of areas) expect(all).toContain(area);
    expect(vercel.rewrites.slice(1).every((r) => r.destination === '/app.html')).toBe(true);
    expect(vercel.redirects).toContainEqual({
      source: '/zenotians',
      destination: '/for-zenotians',
      permanent: true,
    });
  });

  it('has the security and cache headers', () => {
    const all = Object.fromEntries(
      vercel.headers.flatMap((block) => block.headers.map((h) => [h.key, h.value])),
    );
    expect(all['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['Referrer-Policy']).toBe('same-origin');
    const csp = all['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' wss://*.onrender.com");
    const assets = vercel.headers.find((b) => b.source === '/assets/(.*)');
    expect(assets?.headers[0].value).toContain('immutable');
    const html = vercel.headers.find((b) => b.headers.some((h) => h.value === 'no-cache'));
    expect(html?.source).toBe('/(.*)');
    // Later rules win on Vercel: the long cache comes after the no-cache default.
    expect(vercel.headers.indexOf(assets!)).toBeGreaterThan(vercel.headers.indexOf(html!));
  });

  it('the build check fails while the Render address is a placeholder', () => {
    expect(checkVercel(placeholder, GOOD_ENV).join(' ')).toContain(PLACEHOLDER);
    expect(checkVercel(real, GOOD_ENV)).toEqual([]);
  });

  it('the build check wants SITE_URL and a matching VITE_WS_ORIGIN, and no secrets', () => {
    expect(checkVercel(real, { VITE_WS_ORIGIN: GOOD_ENV.VITE_WS_ORIGIN })[0]).toContain('SITE_URL');
    expect(checkVercel(real, { SITE_URL: GOOD_ENV.SITE_URL })[0]).toContain('VITE_WS_ORIGIN');
    expect(
      checkVercel(real, { ...GOOD_ENV, VITE_WS_ORIGIN: 'wss://someone-else.onrender.com' })[0],
    ).toContain('same host');
    expect(checkVercel(real, { ...GOOD_ENV, VITE_TICK_SECRET: 'x' })[0]).toContain('secret');
  });
});
