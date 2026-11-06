import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as chatApi from '../api/chat';
import * as publicApi from '../api/public';
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
  sendPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  photoUrl: (t: string, i: string, part: string) => `/api/chat/threads/${t}/images/${i}/${part}`,
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
}

const card: chatApi.ThreadCard = {
  id: 'th1',
  other: { name: 'Asha', photo_url: '', title: '' },
  appointment: { service_name: 'Haircut', start: '2026-10-30T05:00:00Z', status: 'scheduled' },
  last_message: null,
  unread: 0,
  open: true,
  closes_at: null,
};

const rules: chatApi.PhotoRules = {
  max_bytes: 5 * 1024 * 1024,
  max_side: 4096,
  max_caption: 300,
  per_minute: 6,
  per_day: 30,
  tags: [
    { key: 'style_reference', label: 'Style reference' },
    { key: 'current_hair', label: 'Current hair' },
    { key: 'other', label: 'Other' },
  ],
};

const photoMessage = (over: Partial<chatApi.ChatMessage> = {}): chatApi.ChatMessage => ({
  id: 'm1',
  thread: 'th1',
  mine: true,
  kind: 'image',
  text: 'Like this fade',
  created_at: '2026-10-27T05:00:00Z',
  status: 'sent',
  service: 'Haircut',
  image: {
    id: 'i1',
    tag: 'style_reference',
    tag_label: 'Style reference',
    width: 400,
    height: 300,
    deleted: false,
    alt: 'Like this fade',
  },
  ...over,
});

const goneMessage = (mine = true) =>
  photoMessage({
    mine,
    text: '',
    image: { ...photoMessage().image!, deleted: true, alt: 'Photo deleted' },
  });

const history = (
  messages: chatApi.ChatMessage[],
  over: Partial<chatApi.ThreadHistory> = {},
): chatApi.ThreadHistory => ({
  thread: card,
  open: true,
  closes_at: null,
  max_length: 1000,
  photo: rules,
  references: [],
  messages,
  ...over,
});

const jpg = (name = 'fade.jpg', size = 2000, type = 'image/jpeg') => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]); // the first bytes of a real JPEG
  return new File([bytes], name, { type });
};

function setup(role: 'customer' | 'stylist', h: chatApi.ThreadHistory) {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  );
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(chatApi.listThreads).mockResolvedValue([card]);
  vi.mocked(chatApi.getHistory).mockResolvedValue(h);
  vi.mocked(chatApi.markRead).mockResolvedValue();
}

afterEach(() => vi.unstubAllGlobals());

describe('Zen Chat photos: thread', () => {
  it('shows a thumbnail with the tag badge and caption, with alt text from the caption', async () => {
    setup('customer', history([photoMessage()]));
    renderAt('/customer/chat/th1');
    const img = await screen.findByRole('img', { name: 'Like this fade' });
    expect(img).toHaveAttribute('src', '/api/chat/threads/th1/images/i1/thumb');
    expect(screen.getAllByText('Style reference').length).toBeGreaterThan(0);
    expect(screen.getByText('Like this fade')).toBeInTheDocument();
  });

  it('falls back to the tag for alt text and shows "Photo deleted" for a deleted photo', async () => {
    const deleted = photoMessage({
      id: 'm2',
      text: '',
      image: { ...photoMessage().image!, id: 'i2', deleted: true, alt: 'Photo deleted' },
    });
    setup('customer', history([deleted]));
    renderAt('/customer/chat/th1');
    expect(await screen.findByText('Photo deleted')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo deleted')).toBeNull();
    expect(screen.queryByRole('img', { name: /fade|Photo:/ })).toBeNull();
  });

  it('lists the latest references in a References strip', async () => {
    setup(
      'stylist',
      history([photoMessage({ mine: false })], {
        references: [
          {
            image_id: 'i1',
            message_id: 'm1',
            created_at: '',
            alt: 'Like this fade',
            width: 4,
            height: 3,
          },
        ],
      }),
    );
    renderAt('/chat/th1');
    const strip = await screen.findByRole('region', { name: 'References' });
    expect(
      within(strip).getByRole('button', { name: /Open reference photo: Like this fade/ }),
    ).toBeInTheDocument();
  });

  it('opens a full-screen viewer, zooms with the keyboard and closes with Escape', async () => {
    setup('customer', history([photoMessage()]));
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Open photo: Like this fade/ }));
    const viewer = await screen.findByRole('dialog', { name: 'Photo viewer' });
    expect(within(viewer).getByRole('img', { name: 'Like this fade' })).toHaveAttribute(
      'src',
      '/api/chat/threads/th1/images/i1/full',
    );
    expect(within(viewer).getByText('Zoom: Fit to screen')).toBeInTheDocument();
    await user.keyboard('+');
    expect(within(viewer).getByText('Zoom: 150%')).toBeInTheDocument();
    await user.click(within(viewer).getByRole('button', { name: 'Zoom in' }));
    expect(within(viewer).getByText('Zoom: 200%')).toBeInTheDocument();
    await user.keyboard('0');
    expect(within(viewer).getByText('Zoom: Fit to screen')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).toBeNull());
  });

  it('lets the sender delete a photo after confirming, and hides the button on the other side', async () => {
    setup('customer', history([photoMessage()]));
    vi.mocked(chatApi.deletePhoto).mockImplementation(async () => {
      vi.mocked(chatApi.getHistory).mockResolvedValue(history([goneMessage()]));
    });
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete this photo' }));
    await user.click(await screen.findByRole('button', { name: 'Delete photo' }));
    await waitFor(() => expect(chatApi.deletePhoto).toHaveBeenCalledWith('th1', 'i1'));
    expect(await screen.findByText('Photo deleted')).toBeInTheDocument();
  });

  it('does not offer delete on the other persons photo', async () => {
    setup('stylist', history([photoMessage({ mine: false })]));
    renderAt('/chat/th1');
    await screen.findByRole('img', { name: 'Like this fade' });
    expect(screen.queryByRole('button', { name: 'Delete this photo' })).toBeNull();
  });

  it('swaps a photo for "Photo deleted" when the live connection announces it (ids only)', async () => {
    setup('stylist', history([photoMessage({ mine: false })]));
    renderAt('/chat/th1');
    await screen.findByRole('img', { name: 'Like this fade' });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const ws = FakeSocket.instances[0];
    ws.open();
    vi.mocked(chatApi.getHistory).mockResolvedValue(history([goneMessage(false)]));
    ws.push({ type: 'photo_deleted', message: 'm1', image: 'i1' });
    expect(await screen.findByText('Photo deleted')).toBeInTheDocument();
    expect(screen.queryByText('Like this fade')).toBeNull();
  });
});

describe('Zen Chat photos: sending', () => {
  beforeEach(() => setup('customer', history([])));

  it('has a Photo button next to Send', async () => {
    renderAt('/customer/chat/th1');
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a photo' })).toBeInTheDocument();
    expect(screen.getByTestId('photo-input')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(screen.getByTestId('camera-input')).toHaveAttribute('capture', 'environment');
  });

  it('previews the photo with tag chips (Style reference first for a customer) and sends it', async () => {
    vi.mocked(chatApi.sendPhoto).mockResolvedValue(photoMessage());
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Send a photo' });
    await user.upload(screen.getByTestId('photo-input'), jpg());
    const dialog = await screen.findByRole('dialog', { name: 'Send a photo' });
    expect(within(dialog).getByRole('img', { name: /Preview/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Style reference' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Current hair' }));
    await user.type(within(dialog).getByLabelText('Caption (optional)'), 'Short on the sides');
    await user.click(within(dialog).getByRole('button', { name: 'Send photo' }));
    await waitFor(() => expect(chatApi.sendPhoto).toHaveBeenCalled());
    const [thread, input] = vi.mocked(chatApi.sendPhoto).mock.calls[0];
    expect(thread).toBe('th1');
    expect(input.tag).toBe('current_hair');
    expect(input.caption).toBe('Short on the sides');
    expect(input.file.name).toBe('fade.jpg');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Send a photo' })).toBeNull());
  });

  it('refuses a wrong type with a clear message', async () => {
    renderAt('/customer/chat/th1');
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByRole('button', { name: 'Send a photo' });
    await user.upload(
      screen.getByTestId('photo-input'),
      new File(['hi'], 'notes.pdf', { type: 'application/pdf' }),
    );
    expect(
      await screen.findByText('Only JPG, PNG and WebP photos can be sent.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Send a photo' })).toBeNull();
  });

  it('refuses a text file named .jpg at once, with a visible message', async () => {
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Send a photo' });
    await user.upload(
      screen.getByTestId('photo-input'),
      new File(['this is plain text'], 'holiday.jpg', { type: 'image/jpeg' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Send a photo' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not a photo');
    expect(within(dialog).getByRole('button', { name: 'Send photo' })).toBeDisabled();
    expect(within(dialog).queryByRole('img', { name: /Preview/ })).toBeNull();
    expect(chatApi.sendPhoto).not.toHaveBeenCalled();
  });

  it('refuses a photo over 5 MB in the preview and does not upload it', async () => {
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Send a photo' });
    await user.upload(screen.getByTestId('photo-input'), jpg('big.jpg', 5 * 1024 * 1024 + 1));
    const dialog = await screen.findByRole('dialog', { name: 'Send a photo' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/bigger than 5 MB/);
    expect(within(dialog).getByRole('button', { name: 'Send photo' })).toBeDisabled();
    expect(chatApi.sendPhoto).not.toHaveBeenCalled();
  });

  it('shows the servers message when there are too many photos', async () => {
    vi.mocked(chatApi.sendPhoto).mockRejectedValue({
      response: { status: 429, data: { detail: 'You can send 6 photos a minute. Wait a moment.' } },
    });
    renderAt('/customer/chat/th1');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Send a photo' });
    await user.upload(screen.getByTestId('photo-input'), jpg());
    const dialog = await screen.findByRole('dialog', { name: 'Send a photo' });
    await user.click(within(dialog).getByRole('button', { name: 'Send photo' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('6 photos a minute');
    expect(screen.getByRole('dialog', { name: 'Send a photo' })).toBeInTheDocument(); // stays open
  });

  it('accepts a pasted picture', async () => {
    renderAt('/customer/chat/th1');
    await screen.findByRole('button', { name: 'Send a photo' });
    const box = screen.getByLabelText('Message');
    const file = jpg('paste.png', 100, 'image/png');
    act(() => {
      const event = new Event('paste', {
        bubbles: true,
        cancelable: true,
      }) as unknown as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
      box.dispatchEvent(event);
    });
    expect(await screen.findByRole('dialog', { name: 'Send a photo' })).toBeInTheDocument();
  });

  it('accepts a dropped picture', async () => {
    const view = renderAt('/customer/chat/th1');
    await screen.findByRole('button', { name: 'Send a photo' });
    const area = view.container.querySelector('[aria-live="polite"]') as HTMLElement;
    fireEvent.drop(area, { dataTransfer: { files: [jpg('drop.jpg')], types: ['Files'] } });
    expect(await screen.findByRole('dialog', { name: 'Send a photo' })).toBeInTheDocument();
  });

  it('hides the photo controls when the conversation is read-only', async () => {
    setup('customer', history([], { open: false }));
    renderAt('/customer/chat/th1');
    expect(await screen.findByText(/read-only now/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a photo' })).toBeNull();
  });
});
