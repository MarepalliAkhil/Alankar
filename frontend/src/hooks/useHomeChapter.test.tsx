import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeChapter } from './useHomeChapter';

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let callback: Callback = () => undefined;
const observed: Element[] = [];

class FakeObserver {
  constructor(cb: Callback) {
    callback = cb;
  }
  observe(el: Element) {
    observed.push(el);
  }
  disconnect() {}
  unobserve() {}
}

function Probe() {
  return <p data-testid="chapter">{useHomeChapter()}</p>;
}

describe('useHomeChapter', () => {
  beforeEach(() => {
    observed.length = 0;
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('starts on chapter 1 and follows the section that reaches the middle', () => {
    document.body.innerHTML = '<section data-home-chapter="3"></section>';
    render(<Probe />);
    expect(screen.getByTestId('chapter')).toHaveTextContent('1');
    act(() =>
      callback([
        { isIntersecting: true, target: observed[0] } as Partial<IntersectionObserverEntry>,
      ]),
    );
    expect(screen.getByTestId('chapter')).toHaveTextContent('3');
  });

  it('also watches sections that are drawn after the page content arrives', async () => {
    render(<Probe />);
    expect(observed).toHaveLength(0);
    const late = document.createElement('section');
    late.dataset.homeChapter = '4';
    document.body.appendChild(late);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(observed).toContain(late);
    act(() =>
      callback([{ isIntersecting: true, target: late } as Partial<IntersectionObserverEntry>]),
    );
    expect(screen.getByTestId('chapter')).toHaveTextContent('4');
  });
});
