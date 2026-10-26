import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvite,
  checkInvite,
  confirmPasswordReset,
  ensureCsrf,
  getSession,
  requestPasswordReset,
} from '../api/auth';
import { listMailbox } from '../api/dev';
import { createInvite, deactivateStaff, listInvites, listStaff } from '../api/staff';
import * as publicApi from '../api/public';
import { resendInvite } from '../api/staff';
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
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  checkInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));
vi.mock('../api/staff', () => ({
  listStaff: vi.fn(),
  listInvites: vi.fn(),
  listAudit: vi.fn(),
  createInvite: vi.fn(),
  deactivateStaff: vi.fn(),
  reactivateStaff: vi.fn(),
  resendInvite: vi.fn(),
}));

vi.mock('../api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));
vi.mock('../api/dev', () => ({ listMailbox: vi.fn() }));

const PASSWORD = 'Strong-Pass-2026!';

beforeEach(async () => {
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(null);
  const staff = await import('../api/staff');
  vi.mocked(staff.listAudit).mockResolvedValue([]);
  vi.mocked(listInvites).mockResolvedValue([]);
  vi.mocked(listStaff).mockResolvedValue([]);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
});

const pendingInvite = {
  id: 'i1',
  email: 'arun@example.com',
  full_name: 'Arun K',
  role: 'receptionist' as const,
  status: 'sent' as const,
  delivery: 'email' as const,
  created_at: '2026-10-26T10:00:00Z',
  expires_at: '2026-10-29T10:00:00Z',
  accepted_at: null,
  last_sent_at: '2026-10-26T10:00:00Z',
  send_count: 1,
};

describe('password reset', () => {
  it('requests a link and always shows the generic message', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(
      'If a customer account exists for this email, we have sent a reset link.',
    );
    const user = userEvent.setup();
    renderAt('/forgot-password');
    await user.type(await screen.findByLabelText(/Email/), 'c@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If a customer account exists/)).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith('c@example.com');
  });

  it('sets a new password from the link', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue('Your password has been changed.');
    const user = userEvent.setup();
    renderAt('/reset-password?token=abc123');
    await user.type(await screen.findByLabelText(/^New password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm new password/), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(confirmPasswordReset).toHaveBeenCalledWith('abc123', PASSWORD);
  });

  it('shows the server message for an expired link', async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'This reset link is invalid or has expired.' } },
    });
    const user = userEvent.setup();
    renderAt('/reset-password?token=old');
    await user.type(await screen.findByLabelText(/^New password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm new password/), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });

  it('explains an incomplete link', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText('This reset link is incomplete')).toBeInTheDocument();
  });
});

describe('staff invite acceptance', () => {
  it('activates the account and points to the right sign-in tab', async () => {
    vi.mocked(checkInvite).mockResolvedValue({
      email: 'priya@example.com',
      full_name: 'Priya Sharma',
      role: 'stylist',
    });
    vi.mocked(acceptInvite).mockResolvedValue({ role: 'stylist' });
    const user = userEvent.setup();
    renderAt('/accept-invite?token=tok');
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Priya Sharma' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^New password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm new password/), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Activate my account' }));
    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?role=stylist',
    );
    expect(acceptInvite).toHaveBeenCalledWith('tok', PASSWORD);
  });

  it('shows a clear message for an invalid or production (404) link', async () => {
    vi.mocked(checkInvite).mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderAt('/accept-invite?token=bad');
    expect(
      await screen.findByText('This invite link is invalid or has expired'),
    ).toBeInTheDocument();
  });
});

describe('admin staff page', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
  });

  it('invites a team member', async () => {
    vi.mocked(listStaff).mockResolvedValue([]);
    vi.mocked(createInvite).mockResolvedValue(pendingInvite);
    const user = userEvent.setup();
    renderAt('/staff');
    expect(await screen.findByText('No staff yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(screen.getByText('Choose a role.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Full name/), 'Arun K');
    await user.type(screen.getByLabelText(/^Email/), 'arun@example.com');
    await user.selectOptions(screen.getByLabelText(/^Role/), 'receptionist');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() =>
      expect(vi.mocked(createInvite).mock.calls[0][0]).toEqual({
        full_name: 'Arun K',
        email: 'arun@example.com',
        role: 'receptionist',
      }),
    );
    expect(await screen.findByText('Invite sent to arun@example.com')).toBeInTheDocument();
  });

  it('offers Copy link when the email could not be sent', async () => {
    vi.mocked(listStaff).mockResolvedValue([]);
    vi.mocked(createInvite).mockResolvedValue({
      ...pendingInvite,
      status: 'failed',
      link: 'http://localhost:5173/accept-invite?token=abc',
      detail: 'Email could not be sent. Copy the link instead.',
    });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/staff');
    await screen.findByText('No staff yet');
    await user.type(screen.getByLabelText(/Full name/), 'Arun K');
    await user.type(screen.getByLabelText(/^Email/), 'arun@example.com');
    await user.selectOptions(screen.getByLabelText(/^Role/), 'receptionist');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Email could not be sent. Copy the link instead.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Invite link')).toHaveValue(
      'http://localhost:5173/accept-invite?token=abc',
    );
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/accept-invite?token=abc');
  });

  it('shows invite statuses and resends an invite', async () => {
    vi.mocked(listInvites).mockResolvedValue([
      { ...pendingInvite, status: 'failed' },
      { ...pendingInvite, id: 'i2', email: 'kiran@example.com', status: 'accepted' },
      { ...pendingInvite, id: 'i3', email: 'old@example.com', status: 'expired' },
    ]);
    vi.mocked(resendInvite).mockResolvedValue({ ...pendingInvite, send_count: 2 });
    const user = userEvent.setup();
    renderAt('/staff');
    const table = await screen.findByRole('table', { name: 'Staff invites' });
    expect(within(table).getByText('failed')).toBeInTheDocument();
    expect(within(table).getByText('accepted')).toBeInTheDocument();
    expect(within(table).getByText('expired')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Resend invite' })).toHaveLength(2);
    await user.click(within(table).getAllByRole('button', { name: 'Resend invite' })[0]);
    await waitFor(() => expect(vi.mocked(resendInvite).mock.calls[0][0]).toBe('i1'));
    expect(await screen.findByText('Invite sent again to arun@example.com')).toBeInTheDocument();
  });

  it('deactivates a staff member after confirmation', async () => {
    const member = {
      id: 's1',
      email: 'kiran@example.com',
      full_name: 'Kiran',
      role: 'stylist' as const,
      is_active: true,
      status: 'active' as const,
      date_joined: '2026-10-01T10:00:00Z',
    };
    vi.mocked(listStaff).mockResolvedValue([member]);
    vi.mocked(deactivateStaff).mockResolvedValue({
      ...member,
      is_active: false,
      status: 'deactivated',
    });
    const user = userEvent.setup();
    renderAt('/staff');
    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    await user.click(within(table).getByRole('button', { name: 'Deactivate' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate this account?' });
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(vi.mocked(deactivateStaff).mock.calls[0][0]).toBe('s1'));
    expect(await screen.findByText('Kiran is deactivated')).toBeInTheDocument();
  });

  it('is not reachable for a receptionist', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/staff');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(listStaff).not.toHaveBeenCalled();
  });
});

describe('dev mailbox', () => {
  it('lists simulated emails with in-app links', async () => {
    vi.mocked(listMailbox).mockResolvedValue([
      {
        id: 'm1',
        kind: 'invite',
        to_email: 'priya@example.com',
        subject: 'You are invited',
        body: 'Open the link.',
        link: 'http://localhost:5173/accept-invite?token=xyz',
        created_at: '2026-10-26T10:00:00Z',
      },
    ]);
    renderAt('/dev/mailbox');
    expect(await screen.findByText('You are invited')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute(
      'href',
      '/accept-invite?token=xyz',
    );
  });

  it('explains when the API is not in debug mode', async () => {
    vi.mocked(listMailbox).mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderAt('/dev/mailbox');
    expect(await screen.findByText('Mailbox unavailable')).toBeInTheDocument();
  });
});
