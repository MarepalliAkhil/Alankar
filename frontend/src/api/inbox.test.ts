import type { AxiosAdapter, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatNote } from './inbox';
import { api } from './client';

// The global test setup replaces this module; these tests check the real one.
const { openInbox } = await vi.importActual<typeof import('./inbox')>('./inbox');

class FakeSocket {
  static all: FakeSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closed = true;
  }
  push(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe('my Zen Chat inbox connection', () => {
  const original = api.defaults.adapter;
  beforeEach(() => {
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    api.defaults.adapter = original;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('passes on notes, reconnects after a drop and stops when closed', async () => {
    vi.stubEnv('VITE_WS_ORIGIN', '');
    const notes: ChatNote[] = [];
    const stop = openInbox((n) => notes.push(n));
    expect(FakeSocket.all[0].url).toMatch(/\/api\/ws\/inbox\/$/);
    FakeSocket.all[0].push({ type: 'ready' });
    FakeSocket.all[0].push({ type: 'chat', thread: 't', message: 'm', sender: 'A', preview: 'p' });
    FakeSocket.all[0].push({ type: 'other' });
    expect(notes).toHaveLength(1);
    FakeSocket.all[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeSocket.all).toHaveLength(2);
    stop();
    expect(FakeSocket.all[1].closed).toBe(true);
    FakeSocket.all[1].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('does not retry when the server refuses (not a chat role)', async () => {
    vi.stubEnv('VITE_WS_ORIGIN', '');
    openInbox(() => undefined);
    FakeSocket.all[0].onclose?.({ code: 4403 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('uses a fresh ticket on the Render host on the free deployment', async () => {
    vi.stubEnv('VITE_WS_ORIGIN', 'wss://alankar-api.onrender.com');
    let n = 0;
    api.defaults.adapter = ((config) => {
      n += 1;
      return Promise.resolve({
        data: { ticket: `t${n}` },
        status: 200,
        statusText: '',
        headers: {},
        config,
      } as AxiosResponse);
    }) as AxiosAdapter;
    openInbox(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.all[0].url).toBe('wss://alankar-api.onrender.com/api/ws/inbox/?ticket=t1');
    FakeSocket.all[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeSocket.all[1].url).toContain('?ticket=t2');
  });
});
