import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import css from '../../design/index.css?raw';
import { usePendingAction } from '../../hooks/usePendingAction';
import { SLOW_ACTION_MS } from '../../hooks/useSlowPending';
import { Button } from './Button';
import { Modal } from './Modal';
import { PendingArea } from './PendingArea';

/** A tiny form that behaves like the real ones: one pending flag shared by button and area. */
function Demo({ action }: { action: () => Promise<unknown> }) {
  const [error, setError] = useState('');
  const [run, pending] = usePendingAction(async () => {
    setError('');
    try {
      await action();
    } catch {
      setError('Something went wrong. Try again.');
    }
  });
  return (
    <PendingArea pending={pending} message="Taking your payment…">
      <Button loading={pending} loadingText="Paying…" onClick={() => void run()}>
        Pay now
      </Button>
      {error && <p role="alert">{error}</p>}
    </PendingArea>
  );
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loading states', () => {
  it('Button shows a spinner, is disabled and aria-busy while pending, keeping a short label', () => {
    render(
      <Button loading loadingText="Signing in…">
        Sign in
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Signing in…');
    expect(button.querySelector('.spinner')).not.toBeNull();
    // The normal label stays in place (hidden) so the button keeps its width.
    expect(button).toHaveTextContent('Sign in');
    expect(screen.getByText('Loading')).toHaveClass('sr-only');
  });

  it('shows the spinner at once, then restores the button after success', async () => {
    const user = userEvent.setup();
    const d = deferred();
    const action = vi.fn(() => d.promise);
    render(<Demo action={action} />);
    await user.click(screen.getByRole('button', { name: /pay now/i }));
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.spinner')).not.toBeNull();
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button').querySelector('.spinner')).toBeNull();
  });

  it('restores the button after a failure and shows the message', async () => {
    const user = userEvent.setup();
    const d = deferred();
    render(<Demo action={() => d.promise} />);
    await user.click(screen.getByRole('button', { name: /pay now/i }));
    expect(screen.getByRole('button')).toBeDisabled();
    await act(async () => {
      d.reject(new Error('nope'));
      await d.promise.catch(() => {});
    });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('ignores a second submit while the first is still running', async () => {
    const d = deferred();
    const action = vi.fn(() => d.promise);
    let run!: () => Promise<unknown>;
    function Capture() {
      const [r] = usePendingAction(action);
      run = r;
      return null;
    }
    render(<Capture />);
    await act(async () => {
      void run();
      void run();
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });

  it('covers a slow action with the branded overlay after 800 ms and removes it when done', async () => {
    vi.useFakeTimers();
    const d = deferred();
    render(<Demo action={() => d.promise} />);
    act(() => {
      screen.getByRole('button', { name: /pay now/i }).click();
    });
    expect(screen.queryByTestId('busy-overlay')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_ACTION_MS - 50);
    });
    expect(screen.queryByTestId('busy-overlay')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const overlay = screen.getByTestId('busy-overlay');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveTextContent('Loading. Taking your payment…');
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(screen.queryByTestId('busy-overlay')).toBeNull();
  });

  it('Modal busy shows the overlay only when the action is slow', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Modal open busy onClose={() => {}} title="Approve payroll?">
        Body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('busy-overlay')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_ACTION_MS + 10);
    });
    expect(screen.getByTestId('busy-overlay')).toBeInTheDocument();
    rerender(
      <Modal open busy={false} onClose={() => {}} title="Approve payroll?">
        Body
      </Modal>,
    );
    expect(screen.queryByTestId('busy-overlay')).toBeNull();
  });

  it('reduced motion: the spinner still renders and the stylesheet swaps spinning for a pulse', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      render(<Button loading>Save</Button>);
      expect(screen.getByRole('button').querySelector('.spinner')).not.toBeNull();
      expect(screen.getByText('Loading')).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.spinner\s*\{\s*animation:\s*spinner-pulse[^}]*infinite !important/);
  });
});
