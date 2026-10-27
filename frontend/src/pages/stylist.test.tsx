import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as stylistApi from '../api/stylist';
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
vi.mock('../api/stylist', () => ({
  listAppointments: vi.fn(),
  getAppointment: vi.fn(),
  startVisit: vi.fn(),
  completeVisit: vi.fn(),
  getRatings: vi.fn(),
  getEarnings: vi.fn(),
  getSchedule: vi.fn(),
  requestDaysOff: vi.fn(),
  withdrawDaysOff: vi.fn(),
}));

const card: stylistApi.StylistCard = {
  id: 'v1',
  status: 'checked_in',
  status_label: 'Checked in',
  start: '2026-10-27T05:00:00Z',
  end: '2026-10-27T05:45:00Z',
  duration_minutes: 45,
  customer_first_name: 'Priya',
  service_name: 'Global Hair Colour',
  variant_label: 'Short hair',
  addon_labels: ['Bond-repair treatment'],
  room_name: 'Chair 1',
  allergy_alert: true,
  actions: ['start'],
};

const detail: stylistApi.StylistDetail = {
  ...card,
  status: 'in_progress',
  status_label: 'In progress',
  actions: ['complete'],
  allergies: 'Ammonia',
  preferences: 'Quiet please',
  booked_services: [
    { key: 'service', label: 'Global Hair Colour · Short hair' },
    { key: 'addon-1', label: 'Bond-repair treatment' },
  ],
  history: [],
  completion: null,
};

const earnings = (count: number): stylistApi.Earnings => ({
  month: '2026-10',
  estimated: true,
  rating: {
    count,
    needed: 5,
    enough: count >= 5,
    average: count ? '4.00' : null,
    multiplier: '1.00',
    flagged: false,
  },
  rules: {
    min_ratings: 5,
    bands: [
      { label: '4.5 and above', multiplier: '1.20' },
      { label: 'Below 3.0', multiplier: '0.80' },
    ],
  },
  tasks: [
    {
      id: 't1',
      date: '2026-10-27T06:00:00Z',
      service: 'Global Hair Colour',
      partial: true,
      base_payout: '540.00',
      multiplier: '1.00',
      payout: '540.00',
      tip: '50.00',
      total: '590.00',
    },
  ],
  waiting_checkout: [],
  totals: { tasks: '540.00', tips: '50.00', total: '590.00' },
});

function setup(role: 'stylist' | 'customer' | 'receptionist' | 'admin' = 'stylist') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(stylistApi.listAppointments).mockResolvedValue([card]);
  vi.mocked(stylistApi.getAppointment).mockResolvedValue({ ...detail });
  vi.mocked(stylistApi.getEarnings).mockResolvedValue(earnings(3));
  vi.mocked(stylistApi.getRatings).mockResolvedValue({
    count: 0,
    average: null,
    distribution: {},
    trend: [],
    comments: [{ stars: 5, comment: 'Lovely', tags: [], date: '2026-10-01', service: 'Haircut' }],
  });
  vi.mocked(stylistApi.getSchedule).mockResolvedValue({
    hours: [{ day: 'mon', hours: ['10:00', '20:00'], own: false }],
    days_off: [],
  });
}

describe('stylist pages', () => {
  beforeEach(() => setup());

  it('lands on My Day with the first name only and a Start button', async () => {
    renderAt('/my-day');
    expect(await screen.findByRole('heading', { name: 'Priya' })).toBeInTheDocument();
    expect(screen.getByText(/Allergy alert/)).toBeInTheDocument();
    const start = vi.mocked(stylistApi.startVisit).mockResolvedValue({ ...detail });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start service' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('v1', expect.anything()));
  });

  it('shows the stylist menu: day, appointments, schedule, chat and earnings', async () => {
    renderAt('/my-day');
    const menu = await screen.findByRole('navigation', { name: 'Stylist menu' });
    for (const label of ['My Day', 'My Appointments', 'My Schedule', 'Zen Chat', 'Earnings']) {
      expect(
        within(menu).getByRole('link', { name: new RegExp(`^${label}( Task \\d+[a-z]?)?$`) }),
      ).toBeInTheDocument();
    }
  });

  it('completes a visit with an unticked service and a note', async () => {
    const complete = vi.mocked(stylistApi.completeVisit);
    complete.mockResolvedValue({ ...detail, status: 'completed', actions: [] });
    renderAt('/my-appointments/v1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Complete service' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Bond-repair treatment'));
    await user.type(within(dialog).getByLabelText(/Note for the front desk/), 'No time left');
    await user.click(within(dialog).getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('v1', ['service'], 'No time left'));
  });

  it('shows the ratings rule, the Estimated label and per-task rows on Earnings', async () => {
    renderAt('/earnings');
    expect(await screen.findByText(/Not enough ratings yet \(3 of 5\)/)).toBeInTheDocument();
    expect(screen.getByText('Estimated')).toBeInTheDocument();
    expect(screen.getByText(/4.5 and above/).closest('li')).toHaveTextContent('× 1.20');
    expect(screen.getByText('Global Hair Colour')).toBeInTheDocument();
    expect(screen.getByText('Lovely')).toBeInTheDocument();
  });

  it('tells the stylist to ask reception when days off clash with visits', async () => {
    vi.mocked(stylistApi.requestDaysOff).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          detail: 'You have visits on those days.',
          visits: [
            {
              id: 'v1',
              start: '2026-10-30T05:00:00Z',
              service_name: 'Haircut',
              customer_first_name: 'Priya',
              status_label: 'Scheduled',
            },
          ],
        },
      },
    });
    renderAt('/my-schedule');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^From/), '2026-10-30');
    await user.type(screen.getByLabelText(/^Reason/), 'Family function');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ask the front desk to reschedule them first');
    expect(alert).toHaveTextContent('Priya');
  });

  it('explains an account that is not linked to a profile', async () => {
    vi.mocked(stylistApi.listAppointments).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { code: 'not_linked', detail: 'x' } },
    });
    renderAt('/my-day');
    expect(await screen.findByText(/not linked to a team profile/)).toBeInTheDocument();
  });
});

describe('stylist pages are closed to other roles', () => {
  it.each(['customer', 'receptionist', 'admin'] as const)(
    'blocks a %s from the stylist routes',
    async (role) => {
      for (const path of ['/my-day', '/my-appointments/v1', '/my-schedule']) {
        setup(role);
        const view = renderAt(path);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        view.unmount();
        expect(stylistApi.listAppointments).not.toHaveBeenCalled();
        expect(stylistApi.getAppointment).not.toHaveBeenCalled();
      }
    },
  );
});
