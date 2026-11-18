import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInbox, type ChatNote } from '../../api/inbox';
import { ToastProvider } from '../ui/Toast';
import { chatPathFor } from './chat-path';
import { ChatPopups } from './ChatPopups';

const note: ChatNote = {
  type: 'chat',
  thread: 'th1',
  message: 'm1',
  sender: 'Priya',
  preview: 'Your colour is ready',
  kind: 'text',
};

let deliver: (n: ChatNote) => void = () => undefined;
const close = vi.fn();

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string, role: 'customer' | 'stylist' = 'customer') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <ChatPopups role={role} />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Zen Chat pop-ups', () => {
  beforeEach(() => {
    vi.mocked(openInbox).mockImplementation((cb) => {
      deliver = cb;
      return close;
    });
  });
  afterEach(() => vi.mocked(openInbox).mockReset());

  it('shows who wrote and a preview, and opens the conversation', async () => {
    renderAt('/customer-dashboard');
    act(() => deliver(note));
    expect(screen.getByText('New message from Priya')).toBeInTheDocument();
    expect(screen.getByText('Your colour is ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/customer/chat/th1');
    expect(screen.queryByText('New message from Priya')).not.toBeInTheDocument();
  });

  it('stays quiet while that conversation is already open', () => {
    renderAt('/customer/chat/th1');
    act(() => deliver(note));
    expect(screen.queryByText('New message from Priya')).not.toBeInTheDocument();
    act(() => deliver({ ...note, thread: 'th2', sender: 'Asha' }));
    expect(screen.getByText('New message from Asha')).toBeInTheDocument();
  });

  it('opens one connection and closes it when signed out', () => {
    const { unmount } = renderAt('/my-day', 'stylist');
    expect(openInbox).toHaveBeenCalledTimes(1);
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('uses the right chat page for each role', () => {
    expect(chatPathFor('customer', 'x')).toBe('/customer/chat/x');
    expect(chatPathFor('stylist', 'x')).toBe('/chat/x');
  });
});
