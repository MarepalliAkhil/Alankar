import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as bookingApi from '../api/booking';
import * as privacyApi from '../api/privacy';
import * as publicApi from '../api/public';
import * as securityApi from '../api/security';
import * as workApi from '../api/work';
import { saveBlob } from '../lib/saveBlob';
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
vi.mock('../api/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/booking')>()),
  getProfile: vi.fn(),
}));
vi.mock('../api/security', () => ({
  getAuditLog: vi.fn(),
  downloadAuditCsv: vi.fn(),
  getSecurity: vi.fn(),
  unlockEmail: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  listDataRequests: vi.fn(),
  decideDataRequest: vi.fn(),
}));
vi.mock('../api/privacy', () => ({
  listMyRequests: vi.fn(),
  createMyRequest: vi.fn(),
  cancelMyRequest: vi.fn(),
  downloadMyData: vi.fn(),
}));
vi.mock('../lib/saveBlob', () => ({ saveBlob: vi.fn() }));

const entry = (id: number, action: string): securityApi.AuditRow => ({
  id,
  action,
  actor_email: 'admin@example.com',
  target_email: '',
  email: 'priya@example.com',
  ip_address: '10.0.0.1',
  metadata: { password: '••••', note: 'kept' },
  created_at: '2026-10-27T10:00:00Z',
});
const page = (rows: securityApi.AuditRow[], n = 1, pages = 1): securityApi.AuditPage => ({
  count: rows.length,
  page: n,
  pages,
  results: rows,
  actions: [
    { value: 'login_failed', label: 'Login failed' },
    { value: 'audit_exported', label: 'Audit log downloaded' },
  ],
});
const request = (
  over: Partial<securityApi.AdminDataRequest> = {},
): securityApi.AdminDataRequest => ({
  id: 'r1',
  kind: 'delete',
  status: 'pending',
  customer_label: 'Priya Customer',
  customer_email: 'priya@example.com',
  created_at: '2026-10-26T10:00:00Z',
  decided_at: null,
  decided_by_email: '',
  decision_note: '',
  blockers: [],
  ...over,
});

function setup(role: 'admin' | 'customer' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(securityApi.getAuditLog).mockResolvedValue(page([entry(1, 'login_failed')]));
  vi.mocked(securityApi.getSecurity).mockResolvedValue({
    failed_7d: 6,
    lockouts_7d: 1,
    top_emails: [{ email: 'victim@example.com', count: 5 }],
    recent_failures: [
      { email: 'victim@example.com', ip_address: '1.2.3.4', at: '2026-10-27T09:00:00Z' },
    ],
    locks: [{ email: 'victim@example.com', locked_until: '2026-10-27T11:00:00Z' }],
  });
  vi.mocked(securityApi.listSessions).mockResolvedValue([
    {
      id: 'j1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      signed_in_at: null,
      expires_at: '2026-11-01T00:00:00Z',
      current: true,
    },
    {
      id: 'j2',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'receptionist',
      signed_in_at: '2026-10-27T08:00:00Z',
      expires_at: '2026-11-01T00:00:00Z',
      current: false,
    },
  ]);
  vi.mocked(securityApi.listDataRequests).mockResolvedValue([request()]);
  vi.mocked(privacyApi.listMyRequests).mockResolvedValue([]);
}

describe('audit log page', () => {
  beforeEach(() => setup());

  it('shows entries with masked details and sends the filters', async () => {
    const user = userEvent.setup();
    renderAt('/audit-log');
    expect(await screen.findByText('login failed', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText(/••••/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Action'), 'login_failed');
    await user.type(screen.getByLabelText('Search'), 'priya');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(securityApi.getAuditLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'login_failed', q: 'priya' }),
        1,
      ),
    );
  });

  it('pages through entries and downloads the CSV', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.getAuditLog).mockResolvedValue(page([entry(1, 'login_failed')], 1, 2));
    vi.mocked(securityApi.downloadAuditCsv).mockResolvedValue(new Blob(['x']));
    renderAt('/audit-log');
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(securityApi.getAuditLog).toHaveBeenLastCalledWith(expect.anything(), 2),
    );
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
  });

  it('shows an empty state', async () => {
    vi.mocked(securityApi.getAuditLog).mockResolvedValue(page([]));
    renderAt('/audit-log');
    expect(await screen.findByText('No entries match')).toBeInTheDocument();
  });

  it('is not reachable by a customer', async () => {
    setup('customer');
    renderAt('/audit-log');
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Audit Log' })).not.toBeInTheDocument();
    expect(securityApi.getAuditLog).not.toHaveBeenCalled();
  });
});

describe('security page', () => {
  beforeEach(() => setup());

  it('lists locks and unlocks an email', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.unlockEmail).mockResolvedValue();
    renderAt('/security');
    await user.click(await screen.findByRole('button', { name: 'Unlock victim@example.com' }));
    await waitFor(() => expect(securityApi.unlockEmail).toHaveBeenCalledWith('victim@example.com'));
  });

  it('signs out another session but offers nothing for your own', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.revokeSession).mockResolvedValue();
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Staff sessions' }));
    expect(await screen.findByText('This is you')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Sign out this session/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Sign out this session/ }));
    await waitFor(() => expect(securityApi.revokeSession).toHaveBeenCalledWith('j2'));
  });

  it('asks for a reason before declining and confirms before deleting', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.decideDataRequest).mockResolvedValue(request({ status: 'completed' }));
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Data requests' }));
    await user.click(await screen.findByRole('button', { name: /Delete the account/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Invoices and amounts stay/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(securityApi.decideDataRequest).toHaveBeenCalledWith('r1', 'complete', ''),
    );
  });

  it('shows why a deletion is blocked and the server message on failure', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.listDataRequests).mockResolvedValue([
      request({ blockers: ['The customer still has an open booking. Finish or cancel it first.'] }),
    ]);
    vi.mocked(securityApi.decideDataRequest).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'The customer still has an open booking.' } },
    });
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Data requests' }));
    expect(await screen.findByText(/still has an open booking. Finish/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Delete the account/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('open booking');
  });

  it('declining needs the admin to type a reason (sent to the server)', async () => {
    const user = userEvent.setup();
    vi.mocked(securityApi.decideDataRequest).mockResolvedValue(request({ status: 'declined' }));
    renderAt('/security');
    await user.click(await screen.findByRole('tab', { name: 'Data requests' }));
    await user.click(await screen.findByRole('button', { name: /^Decline/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Not verified');
    await user.click(within(dialog).getByRole('button', { name: 'Decline' }));
    await waitFor(() =>
      expect(securityApi.decideDataRequest).toHaveBeenCalledWith('r1', 'decline', 'Not verified'),
    );
  });
});

describe('your data card on the profile page', () => {
  const mine = (over: Partial<privacyApi.MyDataRequest> = {}): privacyApi.MyDataRequest => ({
    id: 'm1',
    kind: 'export',
    status: 'pending',
    created_at: '2026-10-27T09:00:00Z',
    decided_at: null,
    decision_note: '',
    download_until: null,
    can_download: false,
    ...over,
  });
  beforeEach(() => {
    setup('customer');
    vi.mocked(bookingApi.getProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      allergies: '',
      preferences: '',
      marketing_opt_in: false,
      marketing_opt_changed_at: null,
    });
  });

  it('asks for the data', async () => {
    const user = userEvent.setup();
    vi.mocked(privacyApi.createMyRequest).mockResolvedValue(mine());
    renderAt('/customer/profile');
    await user.click(await screen.findByRole('button', { name: 'Request my data' }));
    await waitFor(() => expect(privacyApi.createMyRequest).toHaveBeenCalledWith('export'));
  });

  it('cancels a waiting request and cannot ask twice', async () => {
    const user = userEvent.setup();
    vi.mocked(privacyApi.listMyRequests).mockResolvedValue([mine()]);
    vi.mocked(privacyApi.cancelMyRequest).mockResolvedValue();
    renderAt('/customer/profile');
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));
    expect(screen.getByRole('button', { name: 'Request my data' })).toBeDisabled();
    await waitFor(() => expect(privacyApi.cancelMyRequest).toHaveBeenCalledWith('m1'));
  });

  it('confirms before sending a deletion request', async () => {
    const user = userEvent.setup();
    vi.mocked(privacyApi.createMyRequest).mockResolvedValue(mine({ kind: 'delete' }));
    renderAt('/customer/profile');
    await user.click(await screen.findByRole('button', { name: 'Request account deletion' }));
    expect(privacyApi.createMyRequest).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Send deletion request' }));
    await waitFor(() => expect(privacyApi.createMyRequest).toHaveBeenCalledWith('delete'));
  });

  it('lets the customer download once the salon has approved', async () => {
    const user = userEvent.setup();
    vi.mocked(privacyApi.listMyRequests).mockResolvedValue([
      mine({ status: 'completed', can_download: true }),
    ]);
    vi.mocked(privacyApi.downloadMyData).mockResolvedValue(new Blob(['{}']));
    renderAt('/customer/profile');
    const buttons = await screen.findAllByRole('button', { name: 'Download my data' });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
  });
});
