import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as chatApi from '../../api/chatbot';
import type { ChatAnswer, ChatReply } from '../../api/chatbot';
import { routerFuture } from '../../config/router';
import type { Role } from '../../policy/policy';
import { SessionContext, type SessionStatus } from '../../session/session-context';
import { userFor } from '../../test/session';
import { ChatWidget } from './ChatWidget';

vi.mock('../../api/chatbot', () => ({ askChatbot: vi.fn() }));
const ask = vi.mocked(chatApi.askChatbot);

function reply(over: Partial<ChatReply> = {}): ChatAnswer {
  return {
    session_id: 's1',
    reply: {
      text: 'We are open 9 to 8.',
      intent: 'hours',
      rephrased: 'opening hours',
      show_rephrase: false,
      actions: [],
      suggestions: [],
      needs_login: false,
      source: 'intent',
      ...over,
    },
  };
}

function mount(role: Role | null, status: SessionStatus = role ? 'authenticated' : 'anonymous') {
  const value = {
    status,
    user: role ? userFor(role) : null,
    signIn: vi.fn(),
    completeOtp: vi.fn(),
    completeTwoFactor: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <SessionContext.Provider value={value}>
      <MemoryRouter future={routerFuture}>
        <ChatWidget />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

const launcher = () => screen.getByRole('button', { name: /AI Alankar Intelligence/i });

describe('ChatWidget', () => {
  beforeEach(() => {
    ask.mockReset();
  });

  it.each([['admin'], ['receptionist'], ['stylist']] as const)('is not shown to %s', (role) => {
    mount(role);
    expect(screen.queryByRole('button', { name: /AI Alankar Intelligence/i })).toBeNull();
  });

  it('is not shown while the session is loading', () => {
    mount(null, 'loading');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens, closes with Escape and returns focus to the launcher', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(launcher());
    expect(screen.getByRole('dialog', { name: 'AI Alankar Intelligence' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Your question'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it('sends a question, shows a typing indicator, then the answer', async () => {
    const user = userEvent.setup();
    let done: (a: ChatAnswer) => void = () => {};
    ask.mockReturnValue(new Promise((resolve) => (done = resolve)));
    mount(null);
    await user.click(launcher());
    await user.type(screen.getByLabelText('Your question'), 'opening hours{Enter}');
    expect(ask).toHaveBeenCalledWith('opening hours', '');
    expect(screen.getByRole('status').textContent).toMatch(/typing/);
    done(reply());
    expect(await screen.findByText('We are open 9 to 8.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the session id for follow-ups', async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(reply());
    mount(null);
    await user.click(launcher());
    await user.type(screen.getByLabelText('Your question'), 'hours{Enter}');
    await screen.findByText('We are open 9 to 8.');
    await user.type(screen.getByLabelText('Your question'), 'and sunday{Enter}');
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask).toHaveBeenLastCalledWith('and sunday', 's1');
  });

  it('shows "Did you mean" buttons for a clarify answer and sends the chosen one', async () => {
    const user = userEvent.setup();
    ask.mockResolvedValueOnce(
      reply({
        text: 'Which one do you mean?',
        source: 'clarify',
        suggestions: ['Hair spa price', 'Spa services'],
      }),
    );
    ask.mockResolvedValueOnce(reply({ text: 'Hair spa is Rs 800.' }));
    mount(null);
    await user.click(launcher());
    await user.type(screen.getByLabelText('Your question'), 'spa{Enter}');
    expect(await screen.findByText('Did you mean:')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hair spa price' }));
    expect(await screen.findByText('Hair spa is Rs 800.')).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith('Hair spa price', 's1');
  });

  it('shows "I understood" and action links from the reply', async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(
      reply({
        show_rephrase: true,
        rephrased: 'haircut price',
        actions: [{ label: 'Call us', url: 'tel:+911234567890' }],
      }),
    );
    mount(null);
    await user.click(launcher());
    await user.type(screen.getByLabelText('Your question'), 'haircat prise{Enter}');
    expect(await screen.findByText('I understood: haircut price')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call us' }).getAttribute('href')).toBe(
      'tel:+911234567890',
    );
  });

  it('offers quick actions: customers get My Appointments, guests do not', async () => {
    const user = userEvent.setup();
    const { unmount } = mount('customer');
    await user.click(launcher());
    expect(screen.getByRole('link', { name: 'My Appointments' }).getAttribute('href')).toBe(
      '/customer/appointments',
    );
    expect(screen.getByRole('link', { name: 'Book an appointment' }).getAttribute('href')).toBe(
      '/customer/book',
    );
    unmount();
    mount(null);
    await user.click(launcher());
    expect(screen.queryByRole('link', { name: 'My Appointments' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Book an appointment' }).getAttribute('href')).toBe(
      '/salon',
    );
  });

  it('shows a calm message when rate limited and when the server fails', async () => {
    const user = userEvent.setup();
    ask.mockRejectedValueOnce({ response: { status: 429 } });
    ask.mockRejectedValueOnce(new Error('boom'));
    mount(null);
    await user.click(launcher());
    await user.type(screen.getByLabelText('Your question'), 'one{Enter}');
    expect(await screen.findByText(/asking quickly/)).toBeTruthy();
    await user.type(screen.getByLabelText('Your question'), 'two{Enter}');
    expect(await screen.findByText(/couldn't answer just now/)).toBeTruthy();
  });

  it('caps the input at 500 characters', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(launcher());
    expect(screen.getByLabelText('Your question').getAttribute('maxlength')).toBe('500');
  });
});
