import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
  getCalendar: vi.fn(() => Promise.resolve([])),
  cancelOwnVisit: vi.fn(),
  getMoveSlots: vi.fn(),
  moveOwnVisit: vi.fn(),
  stylistChangeReasons: [
    { value: 'stylist_unavailable', label: 'I am not available' },
    { value: 'other', label: 'Other' },
  ],
  listRequests: vi.fn(),
  acceptRequest: vi.fn(),
  declineStylistRequest: vi.fn(),
  declineReasons: [
    { value: 'busy', label: 'Busy at that time' },
    { value: 'personal_plans', label: 'Personal plans' },
    { value: 'outside_hours', label: 'Outside my working hours' },
    { value: 'other', label: 'Other' },
  ],
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
  vi.mocked(stylistApi.getCalendar).mockResolvedValue([]);
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(stylistApi.listAppointments).mockResolvedValue([card]);
  vi.mocked(stylistApi.getAppointment).mockResolvedValue({ ...detail });
  vi.mocked(stylistApi.getEarnings).mockResolvedValue(earnings(3));
  vi.mocked(stylistApi.getRatings).mockResolvedValue({
    count: 0,
    under_review: 0,
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

  it('shows "Reference photo attached" only when the customer sent a style reference', async () => {
    renderAt('/my-day');
    await screen.findByRole('heading', { name: 'Priya' });
    expect(screen.queryByText('Reference photo attached')).toBeNull();
    cleanup();
    vi.mocked(stylistApi.listAppointments).mockResolvedValue([{ ...card, reference_photo: true }]);
    renderAt('/my-day');
    expect(await screen.findByText('Reference photo attached')).toBeInTheDocument();
  });

  it('lands on My Day with the first name only and a Start button', async () => {
    renderAt('/my-day');
    expect(await screen.findByRole('heading', { name: 'Priya' })).toBeInTheDocument();
    expect(screen.getByText(/Allergy alert/)).toBeInTheDocument();
    const start = vi.mocked(stylistApi.startVisit).mockResolvedValue({ ...detail });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('v1', expect.anything()));
  });

  it('shows the stylist menu: day, appointments, schedule, chat and earnings', async () => {
    renderAt('/my-day');
    const menu = await screen.findByRole('navigation', { name: 'Main menu' });
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

  it('shows only that a rating is under review: a count, with no details', async () => {
    vi.mocked(stylistApi.getRatings).mockResolvedValue({
      count: 1,
      under_review: 2,
      average: '5.00',
      distribution: { '5': 1 },
      trend: [],
      comments: [{ stars: 5, comment: 'Lovely', tags: [], date: '2026-10-01', service: 'Haircut' }],
    });
    renderAt('/earnings');
    expect(await screen.findByText(/2 ratings are under review/)).toBeInTheDocument();
    expect(screen.getByText(/not counted in your average or pay/)).toBeInTheDocument();
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

describe('stylist requests inbox', () => {
  const request: stylistApi.StylistRequest = {
    id: 'rq1',
    customer_first_name: 'Priya',
    service_name: 'Global Hair Colour',
    variant_label: 'Short hair',
    addon_labels: [],
    start: '2026-10-29T05:00:00Z',
    duration_minutes: 45,
    allergy_alert: false,
    my_status: 'pending',
    my_status_label: 'Waiting for you',
    reception_status: 'accepted',
    reception_status_label: 'Accepted',
    booking_status: 'requested',
    booking_status_label: 'Waiting for approval',
    answer_by: '2026-10-29T03:00:00Z',
    minutes_left: 95,
    can_answer: true,
  };

  beforeEach(() => {
    vi.mocked(stylistApi.getCalendar).mockResolvedValue([]);
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    vi.mocked(stylistApi.listRequests).mockResolvedValue({
      pending_count: 1,
      pending: [request],
      answered: [],
    });
  });

  it('lists pending requests with time left and a first name only', async () => {
    renderAt('/requests');
    expect(await screen.findByText('Priya')).toBeInTheDocument();
    expect(screen.getByText(/1 h 35 min left/)).toBeInTheDocument();
    expect(screen.getByText(/Global Hair Colour/)).toBeInTheDocument();
    expect(screen.queryByText(/priya@|9876|₹/)).toBeNull();
  });

  it('accepts in one click', async () => {
    vi.mocked(stylistApi.acceptRequest).mockResolvedValue({ ...request, my_status: 'accepted' });
    const user = userEvent.setup();
    renderAt('/requests');
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(stylistApi.acceptRequest).toHaveBeenCalledWith('rq1'));
  });

  it('declines only after choosing a private reason', async () => {
    vi.mocked(stylistApi.declineStylistRequest).mockResolvedValue({
      ...request,
      my_status: 'declined',
    });
    const user = userEvent.setup();
    renderAt('/requests');
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Decline/ }));
    expect(stylistApi.declineStylistRequest).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByRole('combobox'), 'personal_plans');
    await user.click(within(dialog).getByRole('button', { name: /^Decline/ }));
    await waitFor(() =>
      expect(stylistApi.declineStylistRequest).toHaveBeenCalledWith('rq1', 'personal_plans'),
    );
  });

  it('is closed to customers', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    renderAt('/requests');
    await waitFor(() => expect(stylistApi.listRequests).not.toHaveBeenCalled());
  });
});

describe('my calendar and changing my own visits', () => {
  const visit: stylistApi.StylistCard = {
    ...card,
    status: 'scheduled',
    actions: ['move', 'cancel'],
  };

  it('shows only my own week with hours and visits', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    vi.mocked(stylistApi.getSchedule).mockResolvedValue({ hours: [], days_off: [] });
    vi.mocked(stylistApi.getCalendar).mockResolvedValue([
      {
        date: '2026-10-28',
        hours: ['10:00', '19:00'],
        day_off: false,
        visits: [visit],
        waiting_requests: [],
      },
      { date: '2026-10-29', hours: null, day_off: true, visits: [], waiting_requests: [] },
    ]);
    renderAt('/my-schedule');
    expect(await screen.findByRole('heading', { name: 'My calendar' })).toBeInTheDocument();
    expect(await screen.findByText(/Priya · Global Hair Colour/)).toBeInTheDocument();
    expect(screen.getByText('Day off')).toBeInTheDocument();
  });

  it('cancels my own visit only after choosing a reason category', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    vi.mocked(stylistApi.getAppointment).mockResolvedValue({ ...detail, ...visit });
    vi.mocked(stylistApi.cancelOwnVisit).mockResolvedValue({ id: 'v1', status: 'cancelled' });
    const user = userEvent.setup();
    renderAt('/my-appointments/v1');
    await user.click(await screen.findByRole('button', { name: 'Cancel visit' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));
    expect(await screen.findByText('Choose a reason first.')).toBeInTheDocument();
    expect(stylistApi.cancelOwnVisit).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByRole('combobox'), 'stylist_unavailable');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));
    await waitFor(() =>
      expect(stylistApi.cancelOwnVisit).toHaveBeenCalledWith('v1', 'stylist_unavailable'),
    );
  });
});
