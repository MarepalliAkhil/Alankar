import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as deskApi from '../api/desk';
import * as publicApi from '../api/public';
import * as staffApi from '../api/staff';
import { resolveDrop, NO_ROOM, PX_PER_MINUTE } from '../components/desk/schedule-math';
import { SLOT_A, SLOT_B, deskRequest, scheduledVisit } from '../test/booking-fixtures';
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
vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  listDaysOff: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/staff', () => ({
  listStaff: vi.fn(),
  listInvites: vi.fn(),
  listAudit: vi.fn(),
  createInvite: vi.fn(),
  deactivateStaff: vi.fn(),
  reactivateStaff: vi.fn(),
  resendInvite: vi.fn(),
  getPosSettings: vi.fn(),
  setPosSettings: vi.fn(),
  setHourlyRate: vi.fn(),
}));
vi.mock('../api/desk', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/desk')>();
  return {
    ...real,
    listDeskAppointments: vi.fn(),
    getDeskAppointment: vi.fn(),
    getConfirmOptions: vi.fn(),
    confirmRequest: vi.fn(),
    rejectRequest: vi.fn(),
    resendPaymentLink: vi.fn(),
    moveAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    markNoShow: vi.fn(),
    declineRequest: vi.fn(),
    getSchedule: vi.fn(),
  };
});

const counts = {
  requested: 0,
  awaiting_payment: 0,
  payment_expired: 0,
  scheduled: 1,
  flags: 1,
  closed: 0,
};

const day: deskApi.ScheduleDay = {
  date: '2026-10-28',
  closed: false,
  open: '2026-10-28T04:30:00Z',
  close: '2026-10-28T14:30:00Z',
  step_minutes: 15,
  stylists: [
    { id: 'st1', display_name: 'Rahul', title: 'Senior stylist', photo_url: '' },
    { id: 'st2', display_name: 'Meera', title: 'Stylist', photo_url: '' },
  ],
  rooms: [{ id: 'r1', name: 'Salon chair 1', division: 'salon' }],
  appointments: [
    {
      id: 'ap2',
      status: 'scheduled',
      status_label: 'Scheduled',
      service_name: "Women's Haircut",
      customer_name: 'Test Customer',
      stylist_id: 'st1',
      room_id: 'r1',
      start: SLOT_A,
      end: '2026-10-28T10:45:00+05:30',
      duration_minutes: 45,
      arrived_at: null,
      reschedule_requested: true,
      cancel_requested: false,
      source: 'online',
      actions: ['move', 'cancel'],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(deskApi.listDeskAppointments).mockResolvedValue({ counts, results: [scheduledVisit] });
  vi.mocked(deskApi.getSchedule).mockResolvedValue(day);
  vi.mocked(deskApi.getDeskAppointment).mockResolvedValue(scheduledVisit);
  vi.mocked(deskApi.getConfirmOptions).mockResolvedValue({
    stylists: [
      {
        id: 'st1',
        display_name: 'Rahul',
        title: 'Senior stylist',
        photo_url: '',
        free_at_preferred: true,
        preferred: false,
      },
    ],
    rooms: [{ id: 'r1', name: 'Salon chair 1', division: 'salon' }],
    date: '2026-10-28',
    slots: [SLOT_A, SLOT_B],
  });
});

describe('appointments: changing booked visits', () => {
  it('moves a scheduled visit with the same drawer used to confirm', async () => {
    vi.mocked(deskApi.moveAppointment).mockResolvedValue(scheduledVisit);
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Move to…' }));
    expect(await screen.findByRole('heading', { name: 'Move booking' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /10:15/ }));
    await user.click(screen.getByRole('button', { name: 'Move booking' }));
    await waitFor(() =>
      expect(deskApi.moveAppointment).toHaveBeenCalledWith('ap2', {
        stylist: 'st1',
        start: SLOT_B,
        room: 'r1',
      }),
    );
  });

  it('offers the nearest free times when the move clashes', async () => {
    vi.mocked(deskApi.moveAppointment).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: 'This stylist is already booked at this time.', slots: [SLOT_B] },
      },
    });
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Move to…' }));
    await user.click(await screen.findByRole('button', { name: /10:00/ }));
    await user.click(screen.getByRole('button', { name: 'Move booking' }));
    expect(await screen.findByText('Nearest free times')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/already booked/);
  });

  it('cancels only with a reason', async () => {
    vi.mocked(deskApi.cancelAppointment).mockResolvedValue({
      ...scheduledVisit,
      status: 'cancelled',
    });
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await screen.findByRole('dialog');
    const confirm = screen.getAllByRole('button', { name: 'Cancel booking' });
    await user.click(confirm[confirm.length - 1]);
    expect(await screen.findByText(/Give a short reason/)).toBeInTheDocument();
    expect(deskApi.cancelAppointment).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Reason/), 'Stylist is unwell');
    const buttons = screen.getAllByRole('button', { name: 'Cancel booking' });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(deskApi.cancelAppointment).toHaveBeenCalledWith('ap2', 'Stylist is unwell'),
    );
  });

  it('marks a no-show and declines a customer request from the card', async () => {
    vi.mocked(deskApi.listDeskAppointments).mockResolvedValue({
      counts,
      results: [
        {
          ...scheduledVisit,
          reschedule_requested: true,
          reschedule_preferred: SLOT_B,
          actions: ['move', 'cancel', 'no_show', 'decline_reschedule'],
        },
      ],
    });
    vi.mocked(deskApi.markNoShow).mockResolvedValue({ ...scheduledVisit, status: 'no_show' });
    vi.mocked(deskApi.declineRequest).mockResolvedValue(scheduledVisit);
    const user = userEvent.setup();
    renderAt('/appointments');
    expect(await screen.findByText(/Customer asked to reschedule/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark no-show' }));
    await waitFor(() => expect(deskApi.markNoShow).toHaveBeenCalledWith('ap2'));
    await user.click(screen.getByRole('button', { name: 'Decline reschedule' }));
    await waitFor(() => expect(deskApi.declineRequest).toHaveBeenCalledWith('ap2', 'reschedule'));
  });

  it('has a tab for customer requests with its count', async () => {
    renderAt('/appointments');
    expect(await screen.findByRole('tab', { name: 'Customer requests (1)' })).toBeInTheDocument();
  });
});

describe('schedule board', () => {
  it('shows the day by stylist with status colours, flags and a Move to… fallback', async () => {
    const user = userEvent.setup();
    renderAt('/schedule');
    expect(await screen.findByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(await screen.findByText('Rahul')).toBeInTheDocument();
    expect(screen.getByText('Meera')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Status colours' });
    expect(within(legend).getByText('Scheduled')).toBeInTheDocument();
    const block = document.querySelector('[data-visit="ap2"]') as HTMLElement;
    expect(block).toHaveAttribute('data-status', 'scheduled');
    expect(within(block).getByText(/Customer asked to reschedule/)).toBeInTheDocument();
    expect(
      within(block).getByRole('button', { name: "Drag Women's Haircut for Test Customer" }),
    ).toBeInTheDocument();

    await user.click(within(block).getByRole('button', { name: 'Move to…' }));
    expect(await screen.findByRole('heading', { name: 'Move booking' })).toBeInTheDocument();
    expect(deskApi.getDeskAppointment).toHaveBeenCalledWith('ap2');
  });

  it('can group by room', async () => {
    const user = userEvent.setup();
    renderAt('/schedule');
    await screen.findByText('Rahul');
    await user.click(screen.getByRole('tab', { name: 'By room' }));
    expect(await screen.findByText('Salon chair 1')).toBeInTheDocument();
    expect(screen.getByText('No room')).toBeInTheDocument();
    expect(screen.queryByText('Meera')).not.toBeInTheDocument();
  });

  it('says so when the salon is closed that day', async () => {
    vi.mocked(deskApi.getSchedule).mockResolvedValue({
      ...day,
      closed: true,
      open: null,
      close: null,
      appointments: [],
    });
    renderAt('/schedule');
    expect(await screen.findByText('The salon is closed this day')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    vi.mocked(deskApi.getSchedule).mockRejectedValue(new Error('boom'));
    renderAt('/schedule');
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
  });

  it('is open to the admin and closed to customers, stylists and guests', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    const { unmount } = renderAt('/schedule');
    expect(await screen.findByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    unmount();
    for (const role of ['customer', 'stylist'] as const) {
      vi.mocked(getSession).mockResolvedValue(userFor(role));
      const view = renderAt('/schedule');
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull());
      view.unmount();
    }
    vi.mocked(deskApi.getSchedule).mockClear();
    vi.mocked(getSession).mockResolvedValue(null);
    renderAt('/schedule');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(deskApi.getSchedule).not.toHaveBeenCalled();
  });
});

describe('where a dropped visit lands', () => {
  const item = day.appointments[0];
  const step = 15;
  const minutes = (n: number) => n * PX_PER_MINUTE;

  it('snaps to the board step and keeps the room when grouped by stylist', () => {
    const target = resolveDrop({
      item,
      deltaY: minutes(32),
      column: 'st2',
      mode: 'stylist',
      stepMinutes: step,
    });
    expect(target).toEqual({
      start: new Date(new Date(SLOT_A).getTime() + 30 * 60_000).toISOString(),
      stylist: 'st2',
      room: 'r1',
    });
  });

  it('changes the room and keeps the stylist when grouped by room', () => {
    const target = resolveDrop({
      item,
      deltaY: 0,
      column: NO_ROOM,
      mode: 'room',
      stepMinutes: step,
    });
    expect(target).toMatchObject({ stylist: 'st1', room: null });
  });

  it('does nothing when it is dropped where it already was, or on no column', () => {
    expect(
      resolveDrop({ item, deltaY: minutes(5), column: 'st1', mode: 'stylist', stepMinutes: step }),
    ).toBeNull();
    expect(
      resolveDrop({ item, deltaY: minutes(60), column: null, mode: 'stylist', stepMinutes: step }),
    ).toBeNull();
  });
});

describe('staff pay and billing settings (admin)', () => {
  const receptionist = {
    id: 's9',
    email: 'rina@example.com',
    full_name: 'Rina',
    role: 'receptionist' as const,
    is_active: true,
    status: 'active' as const,
    date_joined: '2026-10-01T10:00:00Z',
    hourly_rate: null,
  };

  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    vi.mocked(staffApi.listStaff).mockResolvedValue([
      receptionist,
      {
        ...receptionist,
        id: 's8',
        email: 'kiran@example.com',
        full_name: 'Kiran',
        role: 'stylist',
      },
    ]);
    vi.mocked(staffApi.listInvites).mockResolvedValue([]);
    vi.mocked(staffApi.listAudit).mockResolvedValue([]);
  });

  it('saves a receptionist hourly rate and only offers it for receptionists', async () => {
    vi.mocked(staffApi.setHourlyRate).mockResolvedValue({ ...receptionist, hourly_rate: '180.50' });
    const user = userEvent.setup();
    renderAt('/staff');
    const input = await screen.findByLabelText(/Hourly rate for Rina/);
    expect(screen.queryByLabelText(/Hourly rate for Kiran/)).not.toBeInTheDocument();
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    expect(await screen.findByText('Enter an amount like 180 or 180.50.')).toBeInTheDocument();
    expect(staffApi.setHourlyRate).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '180.50');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(staffApi.setHourlyRate).toHaveBeenCalledWith('s9', '180.50'));
  });

  it('keeps the receptionist away from the Staff page', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/staff');
    await screen.findByText("You don't have access to this page");
    expect(staffApi.listStaff).not.toHaveBeenCalled();
  });
});

describe('desk summary on the dashboard', () => {
  it('shows the numbers that need attention', async () => {
    vi.mocked(deskApi.listDeskAppointments).mockResolvedValue({
      counts: { ...counts, requested: 3, awaiting_payment: 2, payment_expired: 1, flags: 4 },
      results: [],
    });
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Today at the desk' })).toBeInTheDocument();
    expect(screen.getByText('New requests').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Customer requests').previousSibling).toHaveTextContent('4');
  });

  it('is not shown to customers', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    renderAt('/customer-dashboard');
    await screen.findByRole('heading', { name: /Welcome/ });
    expect(screen.queryByText('Today at the desk')).not.toBeInTheDocument();
  });
});

// Keep the unused import honest: the base fixture is the request shape the card tests extend.
void deskRequest;
