import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as marketingApi from '../api/marketing';
import { CampaignsPanel } from '../components/admin/marketing/CampaignsPanel';
import { ToastProvider } from '../components/ui';
import { routerFuture } from '../config/router';
import { canCall } from '../policy/policy';

vi.mock('../api/marketing', () => ({
  listCampaigns: vi.fn(),
  listCoupons: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  sendCampaign: vi.fn(),
  previewCampaign: vi.fn(),
  testCampaign: vi.fn(),
  scheduleCampaign: vi.fn(),
  unscheduleCampaign: vi.fn(),
  runDueCampaigns: vi.fn(),
}));

const base: marketingApi.CampaignRow = {
  id: 'k1',
  name: 'Picks',
  subject: 'Picked for you',
  body: 'Hello from the shop.',
  kind: 'for_you',
  kind_label: 'For you (personal recommendations)',
  audience: 'all',
  audience_label: 'All opted-in customers',
  coupon: null,
  status: 'draft',
  scheduled_for: null,
  sent_at: null,
  approved_at: null,
  approved_by: null,
  recipients: null,
  would_reach: 3,
  problem: null,
  results: null,
  created_at: '2026-11-12T10:00:00Z',
};

function show(rows: marketingApi.CampaignRow[]) {
  vi.mocked(marketingApi.listCampaigns).mockResolvedValue({
    opted_in: 3,
    audiences: [{ value: 'all', label: 'All opted-in customers' }],
    kinds: [
      { value: 'custom', label: 'Your own message' },
      { value: 'for_you', label: 'For you (personal recommendations)' },
      { value: 'top_rated', label: 'Highest rated services (5 or more ratings)' },
    ],
    limits: { quiet_hours: [21, 9], min_days: 7, quiet_now: false },
    consent_version: '2026-11',
    results: rows,
  });
  vi.mocked(marketingApi.listCoupons).mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter future={routerFuture}>
          <CampaignsPanel />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());

describe('Personal marketing emails', () => {
  it('states the limits and previews one customer in a sandboxed frame, then tests to me', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.previewCampaign).mockResolvedValue({
      problem: null,
      customer: { id: 'u1', name: 'Keen Customer' },
      subject: 'Picked for you',
      text: 'Often booked together with Mani.',
      html: '<!doctype html><p>Often booked together with Mani.</p>',
    });
    vi.mocked(marketingApi.testCampaign).mockResolvedValue({
      detail: 'Test email sent to me@x.in.',
    });
    show([base]);
    expect(await screen.findByText(/Nothing is sent between 21:00 and 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/no tracking pixels/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview and test…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview and test' });
    const frame = await within(dialog).findByTitle('Email preview');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(within(dialog).getByText(/What Keen Customer would get/)).toBeInTheDocument();
    expect(marketingApi.sendCampaign).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Send a test to me' }));
    await waitFor(() => expect(marketingApi.testCampaign).toHaveBeenCalledWith('k1'));
    expect(marketingApi.sendCampaign).not.toHaveBeenCalled();
  });

  it('cannot approve a campaign whose content does not exist, and says why', async () => {
    show([{ ...base, kind: 'top_rated', problem: 'No service has 5 or more ratings yet.' }]);
    expect(await screen.findByText('No service has 5 or more ratings yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve and send…' })).toBeDisabled();
  });

  it('approves and sends after a confirmation that explains the skips', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.sendCampaign).mockResolvedValue({
      ...base,
      status: 'sending',
    });
    show([base]);
    await user.click(await screen.findByRole('button', { name: 'Approve and send…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and send this campaign?' });
    expect(dialog).toHaveTextContent('emailed in the last week, are skipped');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(marketingApi.sendCampaign).toHaveBeenCalledWith('k1'));
  });

  it('shows results without opens: sent, skipped with reasons, clicked and booked', async () => {
    show([
      {
        ...base,
        status: 'sent',
        recipients: 2,
        sent_at: '2026-11-12T10:00:00Z',
        approved_by: 'Demo Owner',
        results: {
          sent: 2,
          waiting: 0,
          skipped: 1,
          skipped_reasons: [{ reason: 'already emailed in the last 7 days', count: 1 }],
          clicked: 1,
          booked: 1,
          booked_within_days: 7,
        },
      },
    ]);
    const line = await screen.findByText(/2 sent/);
    expect(line).toHaveTextContent('1 skipped · 1 clicked · 1 booked within 7 days');
    expect(line).toHaveTextContent('1 already emailed in the last 7 days');
    expect(screen.getByText(/approved by Demo Owner/)).toBeInTheDocument();
    expect(line.textContent).not.toMatch(/open/i);
  });

  it('lets the admin pick the kind of email when writing a draft', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.createCampaign).mockResolvedValue(base);
    show([]);
    await user.click(await screen.findByRole('button', { name: /New campaign/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New campaign' });
    await user.type(within(dialog).getByLabelText('Name (only you see it)'), 'Picks');
    await user.type(within(dialog).getByLabelText('Email subject'), 'Picked for you');
    await user.selectOptions(within(dialog).getByLabelText('Kind of email'), 'for_you');
    await user.type(within(dialog).getByLabelText('Opening text'), 'Hello from the shop.');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(vi.mocked(marketingApi.createCampaign).mock.calls[0][0]).toMatchObject({
        kind: 'for_you',
      }),
    );
  });

  it('keeps sending and testing for the admin only', () => {
    for (const role of ['customer', 'receptionist', 'stylist'] as const) {
      expect(canCall(role, 'marketing.send')).toBe(false);
      expect(canCall(role, 'marketing.manage')).toBe(false);
    }
    expect(canCall('admin', 'marketing.send')).toBe(true);
  });
});
