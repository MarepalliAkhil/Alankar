import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as botApi from '../api/chatbotAdmin';
import * as publicApi from '../api/public';
import { site } from '../test/fixtures';
import { renderAt } from '../test/render';
import { userFor } from '../test/session';

vi.mock('../api/auth', () => ({
  ensureCsrf: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  registerCustomer: vi.fn(),
  verifyOtp: vi.fn(),
  resendOtp: vi.fn(),
  needsOtp: (result: object) => 'otp_required' in result,
  needsTwoFactor: (result: object) => 'two_factor_required' in result,
  verifyTwoFactor: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  checkInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));
vi.mock('../api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));
vi.mock('../api/work', () => ({ getMyHours: vi.fn(), pingActivity: vi.fn() }));
vi.mock('../api/chatbotAdmin', () => ({
  getInsights: vi.fn(),
  addAsFaq: vi.fn(),
  dismissQuestion: vi.fn(),
  testQuestion: vi.fn(),
}));

const row: botApi.UnansweredRow = {
  id: 7,
  key: 'lip tint price',
  count: 4,
  first_seen: '2026-10-20T10:00:00Z',
  last_seen: '2026-10-27T10:00:00Z',
  status: 'open',
};
const insights: botApi.Insights = {
  days: 30,
  total_questions: 20,
  unanswered_questions: 4,
  unanswered: [row],
  usage: [
    { intent: 'service_price', count: 9 },
    { intent: 'unknown', count: 4 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue(undefined);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(getSession).mockResolvedValue(userFor('admin'));
  vi.mocked(botApi.getInsights).mockResolvedValue(insights);
});

describe('Chatbot insights (admin)', () => {
  it('shows anonymous questions with counts and what people ask', async () => {
    renderAt('/chatbot-insights');
    expect(await screen.findByText('“lip tint price”')).toBeInTheDocument();
    expect(screen.getByText(/Asked 4 times/)).toBeInTheDocument();
    expect(screen.getByText(/20 questions, 4 could not be answered/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'service price: 9' })).toBeInTheDocument();
  });

  it('adds a question as an FAQ in one step', async () => {
    vi.mocked(botApi.addAsFaq).mockResolvedValue({});
    const user = userEvent.setup();
    renderAt('/chatbot-insights');
    await user.click(await screen.findByRole('button', { name: 'Add as FAQ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add as FAQ' });
    expect(within(dialog).getByLabelText('Question')).toHaveValue('Lip tint price');
    expect(within(dialog).getByRole('button', { name: 'Add FAQ' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Answer'), 'Yes, ask at the desk.');
    await user.click(within(dialog).getByRole('button', { name: 'Add FAQ' }));
    await waitFor(() =>
      expect(botApi.addAsFaq).toHaveBeenCalledWith(7, {
        question: 'Lip tint price',
        answer: 'Yes, ask at the desk.',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('dismisses a question', async () => {
    vi.mocked(botApi.dismissQuestion).mockResolvedValue({});
    const user = userEvent.setup();
    renderAt('/chatbot-insights');
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(botApi.dismissQuestion).toHaveBeenCalledWith(7));
  });

  it('asks the test box and shows the answer and how it was understood', async () => {
    vi.mocked(botApi.testQuestion).mockResolvedValue({
      text: 'We are open 9 to 8.',
      intent: 'hours',
      rephrased: '',
      show_rephrase: false,
      actions: [],
      suggestions: [],
      needs_login: false,
      source: 'intent',
    });
    const user = userEvent.setup();
    renderAt('/chatbot-insights');
    await user.type(await screen.findByLabelText('Test question'), 'timings{Enter}');
    expect(await screen.findByText('We are open 9 to 8.')).toBeInTheDocument();
    expect(screen.getByText(/Understood as: hours/)).toBeInTheDocument();
    expect(botApi.testQuestion).toHaveBeenCalledWith('timings');
  });

  it('shows an empty state and an error state', async () => {
    vi.mocked(botApi.getInsights).mockResolvedValueOnce({ ...insights, unanswered: [], usage: [] });
    const { unmount } = renderAt('/chatbot-insights');
    expect(await screen.findByText('Nothing here')).toBeInTheDocument();
    unmount();
    vi.mocked(botApi.getInsights).mockRejectedValue(new Error('x'));
    renderAt('/chatbot-insights');
    expect(await screen.findByText(/couldn't load the chatbot insights/)).toBeInTheDocument();
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)(
    'is not available to %s',
    async (role) => {
      vi.mocked(getSession).mockResolvedValue(userFor(role));
      renderAt('/chatbot-insights');
      await waitFor(() => expect(screen.queryByText('Chatbot insights')).not.toBeInTheDocument());
      expect(botApi.getInsights).not.toHaveBeenCalled();
    },
  );
});
