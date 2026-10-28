import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as workApi from '../api/work';
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, IdleGuard } from '../components/layout/IdleGuard';
import { SessionContext, type SessionValue } from '../session/session-context';
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
vi.mock('../api/payroll', () => ({
  myPayslips: () => Promise.resolve([]),
  myPayslip: () => Promise.reject(new Error('none')),
}));
vi.mock('../api/work', () => ({ getMyHours: vi.fn(), pingActivity: vi.fn() }));

const hours: workApi.MyHours = {
  month: '2026-10',
  hourly_rate: '200.00',
  total_hours: '3.50',
  today_hours: '1.50',
  estimated_pay: '700.00',
  working_now: true,
  idle_minutes: 15,
  sessions: [
    {
      id: 's1',
      started_at: '2026-10-27T04:00:00Z',
      ended_at: '2026-10-27T06:00:00Z',
      hours: '2.00',
      open: false,
      end_reason: 'logout',
      end_reason_label: 'Signed out',
      corrected: true,
      correction_reason: 'Forgot to sign out',
    },
    {
      id: 's2',
      started_at: '2026-10-27T07:00:00Z',
      ended_at: null,
      hours: '1.50',
      open: true,
      end_reason: '',
      end_reason_label: '',
      corrected: false,
      correction_reason: '',
    },
  ],
};

describe('My Hours & Pay', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ensureCsrf).mockResolvedValue();
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    vi.mocked(publicApi.getSite).mockResolvedValue(site);
    vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
    vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
    vi.mocked(workApi.getMyHours).mockResolvedValue(hours);
  });

  it('shows hours, the rate, the estimated pay and each session', async () => {
    renderAt('/my-hours');
    expect(await screen.findByText('3.50 h')).toBeInTheDocument();
    expect(screen.getByText('₹200.00')).toBeInTheDocument();
    expect(screen.getByText('₹700.00')).toBeInTheDocument();
    expect(screen.getByText('On the clock')).toBeInTheDocument();
    expect(screen.getByText(/Forgot to sign out/)).toBeInTheDocument();
    expect(screen.getByText('Corrected by admin')).toBeInTheDocument();
  });

  it('explains a missing hourly rate instead of showing a pay figure', async () => {
    vi.mocked(workApi.getMyHours).mockResolvedValue({
      ...hours,
      hourly_rate: null,
      estimated_pay: null,
    });
    renderAt('/my-hours');
    expect(await screen.findByText('Not set yet')).toBeInTheDocument();
    expect(screen.getByText(/hourly rate has not been set yet/)).toBeInTheDocument();
  });

  it('has an empty state and an error state with retry', async () => {
    vi.mocked(workApi.getMyHours).mockResolvedValueOnce({ ...hours, sessions: [] });
    const first = renderAt('/my-hours');
    expect(await screen.findByText('No hours this month')).toBeInTheDocument();
    first.unmount();
    vi.mocked(workApi.getMyHours).mockRejectedValueOnce(new Error('boom'));
    renderAt('/my-hours');
    expect(await screen.findByText("We couldn't load your hours.")).toBeInTheDocument();
  });

  it('is not available to the admin, stylists or customers', async () => {
    for (const role of ['admin', 'stylist', 'customer'] as const) {
      vi.mocked(getSession).mockResolvedValue(userFor(role));
      const view = renderAt('/my-hours');
      expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
      view.unmount();
    }
    expect(workApi.getMyHours).not.toHaveBeenCalled();
  });

  it('shows the idle notice on the login page', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    renderAt('/login?role=receptionist&reason=idle');
    expect(
      await screen.findByText(/signed out after 15 minutes without activity/),
    ).toBeInTheDocument();
  });
});

describe('idle sign-out', () => {
  const signOut = vi.fn().mockResolvedValue(undefined);
  const value = { signOut } as unknown as SessionValue;

  function mount() {
    return render(
      <SessionContext.Provider value={value}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<IdleGuard />} />
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/" element={<p>home page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>,
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    signOut.mockResolvedValue(undefined);
    vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('warns a minute before the limit and stays signed in on request', async () => {
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS + 6000);
    });
    expect(screen.getByRole('dialog', { name: 'Are you still there?' })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Stay signed in' }).click();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(workApi.pingActivity).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS - 20000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('uses the limit the admin set (the server reports it with each ping)', async () => {
    vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 30 });
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS + 6000);
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out at the limit and goes to the login page', async () => {
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS + 6000);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('tells the server about real activity, at most once a minute', async () => {
    mount();
    expect(workApi.pingActivity).toHaveBeenCalledTimes(1); // on arrival
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('keydown'));
    });
    expect(workApi.pingActivity).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61000);
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(workApi.pingActivity).toHaveBeenCalledTimes(2);
  });

  it('activity before the warning resets the idle clock', async () => {
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS - 10000);
      window.dispatchEvent(new Event('keydown'));
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS - 10000);
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
