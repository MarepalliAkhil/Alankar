import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as airApi from '../../api/air';
import type { AirAnswer, AirReply, AirStatus } from '../../api/air';
import { routerFuture } from '../../config/router';
import type { Role } from '../../policy/policy';
import { SessionContext, type SessionStatus } from '../../session/session-context';
import { userFor } from '../../test/session';
import { CONSENT_TEXT } from './air-text';
import { ChatWidget } from './ChatWidget';

vi.mock('../../api/air', () => ({
  airChat: vi.fn(),
  airStatus: vi.fn(),
  airSendRequest: vi.fn(),
  airConfirm: vi.fn(),
  setAirConsent: vi.fn(),
}));
const chat = vi.mocked(airApi.airChat);
const status = vi.mocked(airApi.airStatus);
const sendRequest = vi.mocked(airApi.airSendRequest);
const confirm = vi.mocked(airApi.airConfirm);
const consent = vi.mocked(airApi.setAirConsent);

function reply(over: Partial<AirReply> = {}, extra: Partial<AirAnswer> = {}): AirAnswer {
  return {
    session_id: 's1',
    cover_active: false,
    ...extra,
    reply: {
      text: 'We are open 9 to 8.',
      intent: 'hours',
      rephrased: '',
      show_rephrase: false,
      actions: [],
      suggestions: [],
      needs_login: false,
      source: 'intent',
      chips: [],
      card: null,
      wording_by_ai: false,
      mode: 'basic',
      ...over,
    },
  };
}

function airStatus(over: Partial<AirStatus> = {}): AirStatus {
  return {
    cover_active: false,
    ai_available: false,
    consent: 'none',
    consent_version: '1',
    consent_text: CONSENT_TEXT,
    ...over,
  };
}

const BOOKING_CARD = {
  type: 'booking' as const,
  hold_id: 'h1',
  service: "Men's Haircut",
  option: '',
  price: 'Rs. 354.00',
  gst_included: 'Rs. 54.00',
  duration_minutes: 30,
  stylist: 'Rahul',
  start: '2026-11-14T11:00:00+05:30',
  when: 'Sat 14 Nov, 11:00 AM',
  held_until: '2026-11-08T10:10:00+05:30',
};

function mount(
  role: Role | null,
  sessionStatus: SessionStatus = role ? 'authenticated' : 'anonymous',
) {
  const value = {
    status: sessionStatus,
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
const box = () => screen.getByLabelText('Your question');

describe('ChatWidget (AIR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.mockResolvedValue(airStatus());
  });

  it.each([['admin'], ['receptionist'], ['stylist']] as const)('is not shown to %s', (role) => {
    mount(role);
    expect(screen.queryByRole('button', { name: /AI Alankar Intelligence/i })).toBeNull();
  });

  it('is not shown while the session is loading', () => {
    mount(null, 'loading');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the exact label, shows the AIR subtitle and the cover note', async () => {
    const user = userEvent.setup();
    status.mockResolvedValue(airStatus({ cover_active: true }));
    mount('customer');
    await user.click(launcher());
    expect(screen.getByRole('dialog', { name: 'AI Alankar Intelligence' })).toBeTruthy();
    expect(screen.getByText('AIR · virtual receptionist')).toBeTruthy();
    expect(await screen.findByText('AIR is covering the front desk right now')).toBeTruthy();
  });

  it('opens, closes with Escape and returns focus to the launcher', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(launcher());
    expect(document.activeElement).toBe(box());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it('offers the six quick chips to customers and the general ones to guests', async () => {
    const user = userEvent.setup();
    const { unmount } = mount('customer');
    await user.click(launcher());
    const nav = screen.getByRole('navigation', { name: 'Quick actions' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Book a haircut',
      "Today's free slots",
      'Opening hours',
      'My requests',
      'My orders',
      'Talk to a person',
    ]);
    unmount();
    mount(null);
    await user.click(launcher());
    const guestNav = screen.getByRole('navigation', { name: 'Quick actions' });
    expect(within(guestNav).queryByRole('button', { name: 'My orders' })).toBeNull();
  });

  it('sends a quick chip as a message in basic mode and keeps the session id', async () => {
    const user = userEvent.setup();
    chat.mockResolvedValue(reply());
    mount(null);
    await user.click(launcher());
    await user.click(screen.getByRole('button', { name: 'Opening hours' }));
    expect(await screen.findByText('We are open 9 to 8.')).toBeTruthy();
    expect(chat).toHaveBeenLastCalledWith({
      message: 'Opening hours',
      sessionId: '',
      basicMode: true,
    });
    await user.type(box(), 'and sunday{Enter}');
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
    expect(chat).toHaveBeenLastCalledWith({
      message: 'and sunday',
      sessionId: 's1',
      basicMode: true,
    });
  });

  it('shows real slot chips and sends the chosen pick', async () => {
    const user = userEvent.setup();
    const pick = { kind: 'slot', start: '2026-11-14T17:00:00+05:30', stylist_id: 'st1' };
    chat.mockResolvedValueOnce(
      reply({ text: 'Free times on Sat 14 Nov:', chips: [{ label: '5:00 PM · Rahul', pick }] }),
    );
    chat.mockResolvedValueOnce(reply({ text: 'Here is your request.', card: BOOKING_CARD }));
    mount('customer');
    await user.click(launcher());
    await user.type(box(), 'haircut saturday evening{Enter}');
    await user.click(await screen.findByRole('button', { name: '5:00 PM · Rahul' }));
    await waitFor(() =>
      expect(chat).toHaveBeenLastCalledWith({ pick, sessionId: 's1', basicMode: true }),
    );
    expect(await screen.findByRole('region', { name: 'Booking summary' })).toBeTruthy();
  });

  it('shows the booking summary card and only the Send request button sends it', async () => {
    const user = userEvent.setup();
    chat.mockResolvedValueOnce(reply({ text: 'Here is your request.', card: BOOKING_CARD }));
    sendRequest.mockResolvedValue(
      reply({ text: 'Your request is sent. Nothing is booked yet.' }, { session_id: 's1' }),
    );
    mount('customer');
    await user.click(launcher());
    await user.type(box(), "men's haircut saturday 11am with rahul{Enter}");
    const card = await screen.findByRole('region', { name: 'Booking summary' });
    for (const text of [
      "Men's Haircut",
      'Rs. 354.00',
      'incl. GST Rs. 54.00',
      '30 min',
      'Rahul',
      'Sat 14 Nov, 11:00 AM',
    ]) {
      expect(within(card).getByText(text, { exact: false })).toBeTruthy();
    }
    expect(within(card).queryByText(/confirmed\b(?! only)/)).toBeNull();
    expect(sendRequest).not.toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Send request' }));
    expect(sendRequest).toHaveBeenCalledWith('h1', 's1');
    expect(await screen.findByText(/Your request is sent/)).toBeTruthy();
    // the old card can not be sent twice
    expect(within(card).getByRole('button', { name: 'Send request' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('Change on the card asks the assistant for other times', async () => {
    const user = userEvent.setup();
    chat.mockResolvedValueOnce(reply({ text: 'Here is your request.', card: BOOKING_CARD }));
    chat.mockResolvedValueOnce(reply({ text: 'What would you like to change?' }));
    mount('customer');
    await user.click(launcher());
    await user.type(box(), 'haircut{Enter}');
    const card = await screen.findByRole('region', { name: 'Booking summary' });
    await user.click(within(card).getByRole('button', { name: 'Change' }));
    expect(chat).toHaveBeenLastCalledWith({
      pick: { kind: 'change' },
      sessionId: 's1',
      basicMode: true,
    });
  });

  it('shows the server message and the rating link when the request is refused', async () => {
    const user = userEvent.setup();
    chat.mockResolvedValueOnce(reply({ text: 'Here is your request.', card: BOOKING_CARD }));
    sendRequest.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail: 'Please rate your last visit first.',
          reply: reply({
            text: 'Please rate your last visit first.',
            actions: [{ label: 'Rate your visit', url: '/customer/book' }],
          }).reply,
        },
      },
    });
    mount('customer');
    await user.click(launcher());
    await user.type(box(), 'haircut{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Please rate your last visit first.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rate your visit' }).getAttribute('href')).toBe(
      '/customer/book',
    );
  });

  it('shows an order card that is placed only by its button', async () => {
    const user = userEvent.setup();
    chat.mockResolvedValueOnce(
      reply({
        text: 'Here is your order.',
        card: {
          type: 'order',
          lines: [{ product: 'p1', name: 'Argan Hair Serum', quantity: 2, amount: 'Rs. 900.00' }],
          total: 'Rs. 949.00',
          delivery_fee: 'Rs. 49.00',
        },
      }),
    );
    confirm.mockResolvedValue(reply({ text: 'Order placed. It is not confirmed until you pay.' }));
    mount('customer');
    await user.click(launcher());
    await user.type(box(), '2 argan serum{Enter}');
    const card = await screen.findByRole('region', { name: 'Order summary' });
    expect(within(card).getByText('Rs. 949.00')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Place order' }));
    expect(confirm).toHaveBeenCalledWith('order', 's1');
    expect(await screen.findByText(/not confirmed until you pay/)).toBeTruthy();
  });

  it('shows the AI consent notice; "Use basic mode" keeps the AI off', async () => {
    const user = userEvent.setup();
    status.mockResolvedValue(airStatus({ ai_available: true }));
    chat.mockResolvedValue(reply());
    mount('customer');
    await user.click(launcher());
    const notice = await screen.findByRole('region', { name: 'AI help notice' });
    expect(within(notice).getByText(CONSENT_TEXT)).toBeTruthy();
    await user.click(within(notice).getByRole('button', { name: 'Use basic mode' }));
    expect(screen.queryByRole('region', { name: 'AI help notice' })).toBeNull();
    expect(consent).not.toHaveBeenCalled();
    await user.type(box(), 'hours{Enter}');
    await waitFor(() =>
      expect(chat).toHaveBeenLastCalledWith({ message: 'hours', sessionId: '', basicMode: true }),
    );
  });

  it('Accept turns AI mode on; the basic-mode toggle turns it off again', async () => {
    const user = userEvent.setup();
    status.mockResolvedValue(airStatus({ ai_available: true }));
    consent.mockResolvedValue({
      granted: true,
      granted_at: '2026-11-08T10:00:00Z',
      withdrawn_at: null,
      version: '1',
      current_version: '1',
      text: CONSENT_TEXT,
    });
    chat.mockResolvedValue(reply({ text: 'Which day?', wording_by_ai: true, mode: 'ai' }));
    mount('customer');
    await user.click(launcher());
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(consent).toHaveBeenCalledWith(true);
    await user.type(box(), 'kal evening haircut kavali{Enter}');
    await waitFor(() =>
      expect(chat).toHaveBeenLastCalledWith({
        message: 'kal evening haircut kavali',
        sessionId: '',
        basicMode: false,
      }),
    );
    expect(await screen.findByText('Wording by AI')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Use basic mode' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await user.type(box(), 'tomorrow{Enter}');
    await waitFor(() =>
      expect(chat).toHaveBeenLastCalledWith({
        message: 'tomorrow',
        sessionId: 's1',
        basicMode: true,
      }),
    );
  });

  it('never shows the consent notice to guests', async () => {
    const user = userEvent.setup();
    status.mockResolvedValue(airStatus({ ai_available: true }));
    mount(null);
    await user.click(launcher());
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'AI help notice' })).toBeNull();
  });

  it('shows a calm message when rate limited and when the server fails', async () => {
    const user = userEvent.setup();
    chat.mockRejectedValueOnce({ response: { status: 429 } });
    chat.mockRejectedValueOnce(new Error('boom'));
    mount(null);
    await user.click(launcher());
    await user.type(box(), 'one{Enter}');
    expect(await screen.findByText(/asking quickly/)).toBeTruthy();
    await user.type(box(), 'two{Enter}');
    expect(await screen.findByText(/couldn't answer just now/)).toBeTruthy();
  });

  it('announces new messages politely and caps the input at 500 characters', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(launcher());
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(box().getAttribute('maxlength')).toBe('500');
  });

  it('has no axe violations with a booking card open', async () => {
    const user = userEvent.setup();
    status.mockResolvedValue(airStatus({ ai_available: true, cover_active: true }));
    chat.mockResolvedValueOnce(
      reply({
        text: 'Here is your request.',
        card: BOOKING_CARD,
        chips: [{ label: 'Change', pick: { kind: 'change' } }],
      }),
    );
    mount('customer');
    await user.click(launcher());
    await user.type(box(), 'haircut{Enter}');
    await screen.findByRole('region', { name: 'Booking summary' });
    const result = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false } }, // jsdom has no layout or colours
    });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
