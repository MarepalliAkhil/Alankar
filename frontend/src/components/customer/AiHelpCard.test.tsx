import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as air from '../../api/air';
import { ToastProvider } from '../ui';
import { AiHelpCard } from './AiHelpCard';

vi.mock('../../api/air', () => ({ getAirConsent: vi.fn(), setAirConsent: vi.fn() }));
const get = vi.mocked(air.getAirConsent);
const put = vi.mocked(air.setAirConsent);

const TEXT =
  "Your messages are sent to an AI service to understand your request. Don't include phone numbers, emails or payment details.";
const on = {
  granted: true,
  granted_at: '2026-11-08T04:30:00Z',
  withdrawn_at: null,
  version: '1',
  current_version: '1',
  text: TEXT,
};
const off = { ...on, granted: false, withdrawn_at: '2026-11-08T05:00:00Z' };

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AiHelpCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AiHelpCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the consent wording and lets the customer withdraw it', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(on);
    put.mockResolvedValue(off);
    wrap();
    expect(await screen.findByText(TEXT)).toBeTruthy();
    expect(screen.getByText(/On since/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Turn AI help off' }));
    expect(put).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('button', { name: 'Turn AI help on' })).toBeTruthy();
    expect(screen.getByText(/never sends your messages to an AI service/)).toBeTruthy();
  });
});
