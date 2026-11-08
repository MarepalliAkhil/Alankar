import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as air from '../../api/air';
import { ToastProvider } from '../ui';
import { CallbackPanel } from './CallbackPanel';

vi.mock('../../api/air', () => ({ listCallbacks: vi.fn(), markCallbackDone: vi.fn() }));
const list = vi.mocked(air.listCallbacks);
const done = vi.mocked(air.markCallbackDone);

const note = {
  id: 'n1',
  customer_name: 'Priya Customer',
  customer_id: 'c1',
  note: 'Asked in the chat to talk to a person.',
  appointment_id: null,
  created_at: '2026-11-08T04:30:00Z',
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CallbackPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('CallbackPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists callback notes and marks one as called back', async () => {
    const user = userEvent.setup();
    list.mockResolvedValueOnce([note]).mockResolvedValue([]);
    done.mockResolvedValue();
    wrap();
    expect(await screen.findByText('Priya Customer')).toBeTruthy();
    expect(screen.getByText('Asked in the chat to talk to a person.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Called back' }));
    expect(done).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(screen.queryByText('Priya Customer')).toBeNull());
  });

  it('shows nothing when there are no notes', async () => {
    list.mockResolvedValue([]);
    const { container } = wrap();
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
