import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORTRAIT_MOBILE_QUERY, usePortraitMobile } from './viewport-image';

/** A fake window.matchMedia whose answer can be changed, as on rotation or resize. */
function fakeMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
  });
  return {
    queries,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('the portrait / landscape choice', () => {
  it('is decided by screen shape, with exactly this query', () => {
    expect(PORTRAIT_MOBILE_QUERY).toBe('(orientation: portrait) and (max-width: 900px)');
    expect(PORTRAIT_MOBILE_QUERY).not.toMatch(/user ?agent|mobile|android|iphone/i);
  });

  it('answers from matchMedia with that query', () => {
    const media = fakeMedia(true);
    const { result } = renderHook(() => usePortraitMobile());
    expect(result.current).toBe(true);
    expect(media.queries.every((q) => q === PORTRAIT_MOBILE_QUERY)).toBe(true);
  });

  it('updates live on rotation and resize', () => {
    const media = fakeMedia(false);
    const { result } = renderHook(() => usePortraitMobile());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when the component goes away', () => {
    const media = fakeMedia(false);
    const { unmount } = renderHook(() => usePortraitMobile());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => usePortraitMobile());
    expect(result.current).toBe(false);
  });
});
