import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as wa from '../api/workAdmin';
import * as workApi from '../api/work';
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
vi.mock('../api/workAdmin', () => ({
  listReceptionists: vi.fn(),
  getReceptionist: vi.fn(),
  saveShifts: vi.fn(),
  correctSession: vi.fn(),
}));

function setup(role: 'admin' | 'receptionist' | 'stylist' | 'customer' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
}

const pay = (over: Partial<wa.MonthPay> = {}): wa.MonthPay => ({
  hourly_rate: '200.00',
  hours: '6.00',
  sessions: 2,
  corrected_sessions: 1,
  pay: '1200.00',
  days: [],
  ...over,
});
const summary = (over: Partial<wa.ReceptionistSummary> = {}): wa.ReceptionistSummary => ({
  id: 'u1',
  name: 'Desk Staff',
  active: true,
  pay: pay(),
  flagged_sessions: 1,
  punctuality: { has_shifts: false, label: 'No shift set' },
  ...over,
});
const session = (over: Partial<wa.AdminSession> = {}): wa.AdminSession => ({
  id: 'ws1',
  started_at: '2026-10-20T03:30:00Z',
  ended_at: '2026-10-20T17:30:00Z',
  hours: '14.00',
  open: false,
  end_reason: 'logout',
  end_reason_label: 'Signed out',
  corrected: false,
  corrected_by: '',
  correction_reason: '',
  flags: [{ code: 'long', label: 'Very long session' }],
  ...over,
});
const detail = (over: Partial<wa.ReceptionistDetail> = {}): wa.ReceptionistDetail => ({
  ...summary(),
  month: '2026-10',
  grace_minutes: 10,
  long_hours: 12,
  sessions: [session()],
  shifts: [null, null, null, null, null, null, null],
  punctuality: { has_shifts: false, label: 'No shift set', days: [] },
  ...over,
});

describe('admin work hours', () => {
  beforeEach(() => {
    setup();
    vi.mocked(wa.listReceptionists).mockResolvedValue({
      month: '2026-10',
      receptionists: [summary()],
      totals: { hours: '6.00', pay: '1200.00' },
      grace_minutes: 10,
      long_hours: 12,
    });
    vi.mocked(wa.getReceptionist).mockResolvedValue(detail());
  });

  it('lists receptionists with hours, pay, "No shift set" and sessions to check', async () => {
    renderAt('/work-hours');
    expect(await screen.findByRole('heading', { name: 'Desk Staff' })).toBeInTheDocument();
    expect(screen.getAllByText(/6.00 hours/).length).toBeGreaterThan(0);
    expect(screen.getByText('No shift set')).toBeInTheDocument();
    expect(screen.getByText('1 session to check')).toBeInTheDocument();
    expect(screen.getByText('1 corrected')).toBeInTheDocument();
    expect(screen.getByText(/within 10 minutes of the shift start/)).toBeInTheDocument();
  });

  it('shows flagged sessions and corrects one with a reason', async () => {
    const user = userEvent.setup();
    vi.mocked(wa.correctSession).mockResolvedValue();
    renderAt('/work-hours');
    await user.click(await screen.findByRole('button', { name: 'Sessions for Desk Staff' }));
    const table = await screen.findByRole('table', { name: 'Sessions of Desk Staff' });
    expect(within(table).getByText('Very long session')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: /Correct session of/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Correct a work session' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Forgot to sign out');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(wa.correctSession).toHaveBeenCalled());
    const [id, body] = vi.mocked(wa.correctSession).mock.calls[0];
    expect(id).toBe('ws1');
    expect(body.reason).toBe('Forgot to sign out');
    expect(body.started_at).toMatch(/\+05:30$/);
  });

  it('asks for a reason before saving a correction', async () => {
    const user = userEvent.setup();
    renderAt('/work-hours');
    await user.click(await screen.findByRole('button', { name: 'Sessions for Desk Staff' }));
    await user.click(await screen.findByRole('button', { name: /Correct session of/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Correct a work session' });
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/reason/i);
    expect(wa.correctSession).not.toHaveBeenCalled();
  });

  it('shows corrected-by on a corrected session', async () => {
    const user = userEvent.setup();
    vi.mocked(wa.getReceptionist).mockResolvedValue(
      detail({
        sessions: [
          session({
            flags: [],
            corrected: true,
            corrected_by: 'Admin One',
            correction_reason: 'Left at four',
          }),
        ],
      }),
    );
    renderAt('/work-hours');
    await user.click(await screen.findByRole('button', { name: 'Sessions for Desk Staff' }));
    expect(await screen.findByText(/Corrected by Admin One: Left at four/)).toBeInTheDocument();
  });

  it('saves weekly shifts and refuses a shift that ends before it starts', async () => {
    const user = userEvent.setup();
    vi.mocked(wa.saveShifts).mockResolvedValue();
    renderAt('/work-hours');
    await user.click(await screen.findByRole('button', { name: 'Sessions for Desk Staff' }));
    const form = await screen.findByRole('form', { name: 'Weekly shifts for Desk Staff' });
    await user.click(within(form).getByRole('button', { name: 'Add shift on Monday' }));
    fireEvent.change(within(form).getByLabelText('Monday end'), { target: { value: '08:00' } });
    await user.click(within(form).getByRole('button', { name: 'Save shifts' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/Monday: the shift must end/);
    expect(wa.saveShifts).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Monday end'), { target: { value: '18:00' } });
    await user.click(within(form).getByRole('button', { name: 'Save shifts' }));
    await waitFor(() =>
      expect(wa.saveShifts).toHaveBeenCalledWith('u1', [
        { start: '09:00', end: '18:00' },
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    );
  });

  it('shows on-time, late and missed days when shifts exist', async () => {
    const user = userEvent.setup();
    vi.mocked(wa.getReceptionist).mockResolvedValue(
      detail({
        punctuality: {
          has_shifts: true,
          shifts_counted: 3,
          on_time: 1,
          late: 1,
          missed: 1,
          on_time_rate: '33.3',
          days: [
            {
              date: '2026-10-19',
              shift: '09:00-17:00',
              state: 'on_time',
              minutes_late: 0,
              signed_in: null,
            },
            {
              date: '2026-10-20',
              shift: '09:00-17:00',
              state: 'late',
              minutes_late: 25,
              signed_in: null,
            },
            {
              date: '2026-10-21',
              shift: '09:00-17:00',
              state: 'missed',
              minutes_late: null,
              signed_in: null,
            },
          ],
        },
      }),
    );
    renderAt('/work-hours');
    await user.click(await screen.findByRole('button', { name: 'Sessions for Desk Staff' }));
    expect(await screen.findByText('25 minutes after the start')).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(
      screen.getAllByText(/On time 1 of 3 shifts \(33.3%\), late 1, missed 1/).length,
    ).toBeGreaterThan(0);
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)(
    'is not available to the %s role',
    async (role) => {
      setup(role);
      renderAt('/work-hours');
      expect(
        await screen.findByText(/not allowed|isn.t available|403|cannot/i),
      ).toBeInTheDocument();
      expect(wa.listReceptionists).not.toHaveBeenCalled();
    },
  );
});
