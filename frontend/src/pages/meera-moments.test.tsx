import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as bookingApi from '../api/booking';
import * as publicApi from '../api/public';
import { appointment, awaiting, options, slotResult } from '../test/booking-fixtures';
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
vi.mock('../api/billing', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/billing')>();
  return {
    ...real,
    listMyInvoices: vi.fn(),
    getPendingRatings: vi.fn().mockResolvedValue({ count: 0, results: [], tags: [] }),
    submitRating: vi.fn(),
  };
});
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
vi.mock('../api/booking', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/booking')>();
  return {
    ...real,
    getBookingOptions: vi.fn(),
    getSlots: vi.fn(),
    sendBookingRequest: vi.fn(),
    listMyAppointments: vi.fn(),
    actOnAppointment: vi.fn(),
    getPayment: vi.fn(),
    payAppointment: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    respondToChange: vi.fn(),
  };
});
vi.mock('../api/privacy', () => ({
  listMyRequests: vi.fn().mockResolvedValue([]),
  createMyRequest: vi.fn(),
  cancelMyRequest: vi.fn(),
  downloadMyData: vi.fn(),
}));

vi.mock('virtual:photo-manifest', () => ({
  default: [
    'meera/meera.webp',
    'meera/meera-waiting.webp',
    'meera/meera-approve.webp',
    'meera/meera-celebrate.webp',
    'meera/meera-sorry.webp',
    'meera/meera-calendar.webp',
  ],
}));

const customer = userFor('customer');

beforeEach(() => {
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(customer);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(bookingApi.getBookingOptions).mockResolvedValue(options);
  vi.mocked(bookingApi.getSlots).mockResolvedValue(slotResult);
});

const waiting = {
  ...appointment,
  approval: {
    stage: 'waiting' as const,
    label: 'Waiting for approval',
    message: 'The front desk and your stylist both need to say yes.',
    answer_by: null,
  },
};
const declined = {
  ...appointment,
  id: 'ap3',
  status: 'declined_by_stylist',
  approval: {
    stage: 'declined' as const,
    label: 'Not available',
    message: 'That time could not be offered. Please choose another.',
    answer_by: null,
  },
  actions: [],
};
const confirmed = { ...awaiting, id: 'ap4', status: 'scheduled', actions: ['cancel'] };
const changed = {
  ...confirmed,
  id: 'ap5',
  pending_change: {
    kind: 'moved' as const,
    reason: 'a stylist change',
    old_start: '2026-10-28T10:00:00+05:30',
    new_start: '2026-10-28T11:00:00+05:30',
    new_stylist_name: null,
    can_accept: true,
    can_rebook: true,
    can_cancel: true,
  },
};

const meeraIn = (el: HTMLElement) => el.querySelector('[data-meera-moment] [data-meera]');

describe('small Meera moments on My bookings', () => {
  it('shows meera-waiting with a friendly line for a request waiting for approval', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([waiting] as never);
    renderAt('/customer/appointments');
    const card = await screen.findByRole('article');
    expect(
      within(card).getByText('Waiting for the nod from the front desk and your stylist.'),
    ).toBeInTheDocument();
    expect(meeraIn(card)).toHaveAttribute('data-meera', 'waiting');
    const img = card.querySelector('[data-meera-moment] img')!;
    expect(img).toHaveAttribute('src', '/photos/meera/meera-waiting.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('shows meera-celebrate (only now) for a confirmed booking', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([confirmed] as never);
    renderAt('/customer/appointments');
    const card = await screen.findByRole('article');
    expect(meeraIn(card)).toHaveAttribute('data-meera', 'celebrate');
    expect(within(card).getByText(/You are confirmed/)).toBeInTheDocument();
  });

  it('shows meera-sorry with the existing polite wording for a declined request', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([declined] as never);
    renderAt('/customer/appointments');
    const card = await screen.findByRole('article');
    expect(meeraIn(card)).toHaveAttribute('data-meera', 'sorry');
    expect(within(card).getByText(/That time could not be offered/)).toBeInTheDocument();
    expect(within(card).queryByText(/Waiting for the nod/)).toBeNull();
  });

  it('shows meera-sorry on the notice after staff change a slot', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([changed] as never);
    renderAt('/customer/appointments');
    const note = await screen.findByRole('group', { name: 'Change to your booking' });
    expect(meeraIn(note)).toHaveAttribute('data-meera', 'sorry');
    expect(within(note).getByText('We had to move your appointment')).toBeInTheDocument();
    expect(within(note).getByRole('button', { name: 'Accept new time' })).toBeInTheDocument();
  });

  it('keeps the words and shows no picture or letter circle when no image can be shown', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([waiting] as never);
    renderAt('/customer/appointments');
    const card = await screen.findByRole('article');
    card.querySelectorAll('[data-meera-moment] img').forEach((img) => fireEvent.error(img));
    // waiting fails, then the default meera.webp fails too: nothing is drawn, the line stays
    card.querySelectorAll('[data-meera-moment] img').forEach((img) => fireEvent.error(img));
    expect(card.querySelector('[data-meera-moment] img')).toBeNull();
    expect(card.querySelector('[data-meera-source="letter"]')).toBeNull();
    expect(
      within(card).getByText('Waiting for the nod from the front desk and your stylist.'),
    ).toBeInTheDocument();
  });
});
