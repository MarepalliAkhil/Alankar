import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/notifications';
import { NotificationBell } from './NotificationBell';

const unread = {
  id: 'n1',
  kind: 'request_new',
  title: 'New booking request',
  body: 'Priya asked for a haircut.',
  link: '/requests',
  created_at: '2026-10-28T05:00:00Z',
  read_at: null,
};

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationBell listPath="/notifications" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listNotifications).mockResolvedValue({ unread: 1, results: [unread] });
  vi.mocked(api.markNotificationsRead).mockResolvedValue({ unread: 0 });
});

describe('notification bell', () => {
  it('shows how many are unread and lists them', async () => {
    const user = userEvent.setup();
    show();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    expect(await screen.findByText('New booking request')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New booking request/ })).toHaveAttribute(
      'href',
      '/requests',
    );
    expect(screen.getByRole('link', { name: 'See all notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('is icon only: no visible text, a count badge, and the count in its name', async () => {
    show();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(bell.textContent).toBe('1'); // only the badge: no word "Notifications" on screen
    expect(screen.getByTestId('bell-count')).toHaveTextContent('1');
    expect(bell.getAttribute('aria-label')).toMatch(/^Notifications/);
  });

  it('marks everything as read', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalled());
  });

  it('says so when there is nothing new, and closes with Escape', async () => {
    vi.mocked(api.listNotifications).mockResolvedValue({ unread: 0, results: [] });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Nothing new.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Nothing new.')).toBeNull());
  });
});
