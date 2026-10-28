import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as chatApi from '../api/chat';
import * as publicApi from '../api/public';
import { useChat } from '../hooks/useChat';
import { beard, haircut, site } from '../test/fixtures';
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
vi.mock('../api/chat', async () => ({
  listThreads: vi.fn(),
  getHistory: vi.fn(),
  sendViaRest: vi.fn(),
  markRead: vi.fn(),
  socketUrl: (id: string) => `ws://test/api/ws/chat/${id}/`,
}));

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.push({ type: 'ready' });
  }
  push(frame: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(frame) }));
  }
  drop(code = 1006) {
    this.readyState = 3;
    act(() => this.onclose?.({ code }));
  }
}

const card: chatApi.ThreadCard = {
  id: 'th1',
  other: { name: 'Priya', photo_url: '', title: '' },
  appointment: { service_name: 'Haircut', start: '2026-10-30T05:00:00Z', status: 'scheduled' },
  last_message: { preview: 'See you soon', created_at: '2026-10-27T05:00:00Z', mine: false },
  unread: 3,
  open: true,
  closes_at: null,
};

const evil = '<img src=x onerror="alert(1)"> <b>bold</b>';

const history = (open = true): chatApi.ThreadHistory => ({
  thread: card,
  open,
  closes_at: null,
  max_length: 1000,
  messages: [
    {
      id: 'm1',
      thread: 'th1',
      mine: false,
      text: evil,
      created_at: '2026-10-27T05:00:00Z',
      status: 'sent',
      service: 'Haircut',
    },
    {
      id: 'm2',
      thread: 'th1',
      mine: true,
      text: 'Thanks!',
      created_at: '2026-10-27T05:01:00Z',
      status: 'delivered',
      service: 'Haircut',
    },
  ],
});

function setup(role: 'stylist' | 'customer' | 'receptionist' | 'admin' = 'stylist') {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(chatApi.listThreads).mockResolvedValue([card]);
  vi.mocked(chatApi.getHistory).mockResolvedValue(history());
  vi.mocked(chatApi.markRead).mockResolvedValue();
}

afterEach(() => vi.unstubAllGlobals());

describe('Zen Chat person cards', () => {
  beforeEach(() => setup('stylist'));

  it('shows a card per conversation with the unread badge, linking to the thread', async () => {
    renderAt('/chat');
    const link = await screen.findByRole('link', {
      name: /Open conversation with Priya, 3 unread/,
    });
    expect(link).toHaveAttribute('href', '/chat/th1');
    expect(within(link).getByText('3')).toBeInTheDocument();
    expect(within(link).getByText(/Haircut/)).toBeInTheDocument();
    expect(within(link).getByText('See you soon')).toBeInTheDocument();
  });

  it('is in the stylist menu as Zen Chat', async () => {
    renderAt('/chat');
    const menu = await screen.findByRole('navigation', { name: 'Stylist menu' });
    expect(within(menu).getByRole('link', { name: /^Zen Chat/ })).toBeInTheDocument();
  });

  it('explains an empty list', async () => {
    vi.mocked(chatApi.listThreads).mockResolvedValue([]);
    renderAt('/chat');
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
  });
});

describe('a conversation', () => {
  beforeEach(() => setup('stylist'));

  it('shows messages as escaped plain text, never as markup', async () => {
    const view = renderAt('/chat/th1');
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(view.container.querySelector('img[src="x"]')).toBeNull();
    expect(view.container.querySelector('b')).toBeNull();
  });

  it('sends over the live connection, shows typing, new messages and read ticks', async () => {
    renderAt('/chat/th1');
    await screen.findByText(evil);
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const ws = FakeSocket.instances[0];
    ws.open();
    expect(await screen.findByText('Live')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message'), 'On my way');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const frames = ws.sent.map((s) => JSON.parse(s) as { type: string; text?: string });
    expect(frames.some((f) => f.type === 'typing')).toBe(true);
    const sent = frames.find((f) => f.type === 'message');
    expect(sent?.text).toBe('On my way');
    expect(screen.getByText('On my way')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();

    const clientId = (
      JSON.parse(ws.sent.find((s) => s.includes('"message"'))!) as { client_id: string }
    ).client_id;
    ws.push({
      type: 'message',
      message: {
        id: 'm3',
        thread: 'th1',
        mine: true,
        text: 'On my way',
        created_at: '2026-10-27T05:02:00Z',
        status: 'sent',
        service: 'Haircut',
        client_id: clientId,
      },
    });
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
    expect(screen.getAllByText('On my way')).toHaveLength(1);

    ws.push({ type: 'status', ids: ['m3'], status: 'read' });
    expect(await screen.findAllByLabelText('Read')).not.toHaveLength(0);

    ws.push({ type: 'typing', on: true });
    expect(await screen.findByText('Priya is typing…')).toBeInTheDocument();
    ws.push({
      type: 'message',
      message: {
        id: 'm4',
        thread: 'th1',
        mine: false,
        text: 'Great',
        created_at: '2026-10-27T05:03:00Z',
        status: 'delivered',
        service: '',
      },
    });
    expect(await screen.findByText('Great')).toBeInTheDocument();
    expect(screen.queryByText('Priya is typing…')).not.toBeInTheDocument();
  });

  it('is read-only after the thread closes', async () => {
    vi.mocked(chatApi.getHistory).mockResolvedValue(history(false));
    renderAt('/chat/th1');
    expect(await screen.findByText(/read-only now/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  });

  it('says so when the conversation is not available (not yours)', async () => {
    vi.mocked(chatApi.getHistory).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    renderAt('/chat/nope');
    expect(await screen.findByText('This conversation is not available')).toBeInTheDocument();
  });
});

describe('reconnecting', () => {
  beforeEach(() => {
    setup('stylist');
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('reconnects with backoff and re-fetches what it missed; sends over REST meanwhile', async () => {
    const { result } = renderHook(() => useChat('th1'));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    FakeSocket.instances[0].open();
    await waitFor(() => expect(result.current.connection).toBe('live'));
    const loads = vi.mocked(chatApi.getHistory).mock.calls.length;

    FakeSocket.instances[0].drop(1006);
    expect(result.current.connection).toBe('offline');

    vi.mocked(chatApi.sendViaRest).mockResolvedValue({
      id: 'm9',
      thread: 'th1',
      mine: true,
      text: 'offline hello',
      created_at: '2026-10-27T05:09:00Z',
      status: 'sent',
      service: '',
    });
    await act(async () => {
      await result.current.send('offline hello');
    });
    expect(chatApi.sendViaRest).toHaveBeenCalledWith('th1', 'offline hello');
    expect(result.current.messages.some((m) => m.id === 'm9')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open();
    await waitFor(() => expect(chatApi.getHistory).toHaveBeenCalledTimes(loads + 1));
    expect(result.current.connection).toBe('live');
  });

  it('does not keep retrying after the server refuses the connection', async () => {
    renderHook(() => useChat('th1'));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    FakeSocket.instances[0].drop(4403);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('customer side', () => {
  beforeEach(() => setup('customer'));

  it('shows the stylist cards under Stylist Chat', async () => {
    vi.mocked(chatApi.listThreads).mockResolvedValue([
      { ...card, other: { name: 'Asha', photo_url: '', title: 'Senior Stylist' }, unread: 0 },
    ]);
    renderAt('/customer/chat');
    const link = await screen.findByRole('link', { name: /Open conversation with Asha/ });
    expect(link).toHaveAttribute('href', '/customer/chat/th1');
  });

  it('opens a conversation from a card link', async () => {
    renderAt('/customer/chat/th1');
    expect(await screen.findByText(evil)).toBeInTheDocument();
  });
});

describe('chat is closed to receptionists and admins (and across roles)', () => {
  it.each([
    ['receptionist', '/chat'],
    ['receptionist', '/chat/th1'],
    ['receptionist', '/customer/chat'],
    ['admin', '/chat'],
    ['admin', '/chat/th1'],
    ['admin', '/customer/chat'],
    ['customer', '/chat'],
    ['customer', '/chat/th1'],
    ['stylist', '/customer/chat'],
    ['stylist', '/customer/chat/th1'],
  ] as const)('%s cannot open %s', async (role, path) => {
    setup(role);
    renderAt(path);
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(chatApi.listThreads).not.toHaveBeenCalled();
    expect(chatApi.getHistory).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
