import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as bookingApi from '../api/booking';
import * as deskApi from '../api/desk';
import * as publicApi from '../api/public';
import {
  appointment,
  awaiting,
  deskRequest,
  options,
  SLOT_A,
  SLOT_B,
  slotResult,
} from '../test/booking-fixtures';
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
  };
});
vi.mock('../api/privacy', () => ({
  listMyRequests: vi.fn().mockResolvedValue([]),
  createMyRequest: vi.fn(),
  cancelMyRequest: vi.fn(),
  downloadMyData: vi.fn(),
}));
vi.mock('../api/desk', () => ({
  listDeskAppointments: vi.fn(),
  getConfirmOptions: vi.fn(),
  confirmRequest: vi.fn(),
  rejectRequest: vi.fn(),
  resendPaymentLink: vi.fn(),
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
  vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([appointment, awaiting]);
});

async function fillDetailsAndPickTime(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /10:00/ }));
  await user.click(screen.getByLabelText(/cancellation policy/));
}

describe('booking sheet', () => {
  it('lists services to choose from when none is selected', async () => {
    renderAt('/customer/book');
    expect(await screen.findByRole('heading', { name: "Women's Haircut" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Book Women's Haircut" })).toHaveAttribute(
      'href',
      '/customer/book?service=womens-haircut',
    );
  });

  it('sends a request with the chosen option, time and details', async () => {
    vi.mocked(bookingApi.sendBookingRequest).mockResolvedValue(appointment);
    const user = userEvent.setup();
    renderAt('/customer/book?service=womens-haircut');
    await fillDetailsAndPickTime(user);
    expect(screen.getAllByText('₹500').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Send booking request' }));
    await waitFor(() => expect(bookingApi.sendBookingRequest).toHaveBeenCalled());
    expect(bookingApi.sendBookingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'womens-haircut',
        variant: 'v1',
        start: SLOT_A,
        stylist: null,
        contact_phone: '9876543210',
        consent: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'My appointments' })).toBeInTheDocument();
  });

  it('asks for a time and the cancellation policy before sending', async () => {
    const user = userEvent.setup();
    renderAt('/customer/book?service=womens-haircut');
    await user.click(await screen.findByRole('button', { name: 'Send booking request' }));
    expect(await screen.findByText('Choose a time.')).toBeInTheDocument();
    expect(screen.getByText('Please accept the cancellation policy.')).toBeInTheDocument();
    expect(bookingApi.sendBookingRequest).not.toHaveBeenCalled();
  });

  it('offers the nearest free times when the chosen time was just taken', async () => {
    vi.mocked(bookingApi.sendBookingRequest).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'taken', slots: [SLOT_B] } },
    });
    const user = userEvent.setup();
    renderAt('/customer/book?service=womens-haircut');
    await fillDetailsAndPickTime(user);
    await user.click(screen.getByRole('button', { name: 'Send booking request' }));
    expect(await screen.findByText('Nearest free times')).toBeInTheDocument();
    expect(screen.getByText('That time was just taken')).toBeInTheDocument();
  });

  it('sends a package code along with the request, and shows it will cover the price', async () => {
    vi.mocked(bookingApi.sendBookingRequest).mockResolvedValue(appointment);
    const user = userEvent.setup();
    renderAt('/customer/book?service=womens-haircut');
    await fillDetailsAndPickTime(user);
    await user.type(screen.getByLabelText('Package code'), '4F7K-9QRS-T2WX');
    expect(
      await screen.findByText(/one session will be used and nothing will be due/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send booking request' }));
    await waitFor(() => expect(bookingApi.sendBookingRequest).toHaveBeenCalled());
    expect(bookingApi.sendBookingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ package_code: '4F7K-9QRS-T2WX' }),
    );
  });

  it('shows a package code problem under the field, without treating it as a slot conflict', async () => {
    vi.mocked(bookingApi.sendBookingRequest).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: 'This package has expired.', field: 'package_code' },
      },
    });
    const user = userEvent.setup();
    renderAt('/customer/book?service=womens-haircut');
    await fillDetailsAndPickTime(user);
    await user.type(screen.getByLabelText('Package code'), 'EXPIRED-CODE');
    await user.click(screen.getByRole('button', { name: 'Send booking request' }));
    expect(await screen.findByText('This package has expired.')).toBeInTheDocument();
    expect(screen.queryByText('Nearest free times')).not.toBeInTheDocument();
    expect(screen.queryByText('That time was just taken')).not.toBeInTheDocument();
    // The chosen time is kept, not cleared, so the slot button still shows as selected.
    expect(screen.getByRole('button', { name: /10:00/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state for a service that is not available', async () => {
    vi.mocked(bookingApi.getBookingOptions).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    renderAt('/customer/book?service=gone');
    expect(await screen.findByText('This service is not available')).toBeInTheDocument();
  });

  it('keeps guests and staff out', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    renderAt('/customer/book?service=womens-haircut');
    expect(await screen.findByRole('heading', { name: /Sign in/ })).toBeInTheDocument();
    expect(bookingApi.getBookingOptions).not.toHaveBeenCalled();
  });

  it('sends staff to the 403 page', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/customer/book');
    expect(await screen.findByText(/not allowed|don.t have access|403/i)).toBeInTheDocument();
  });
});

describe('my appointments', () => {
  it('shows a card per booking with only the actions allowed', async () => {
    renderAt('/customer/appointments');
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    const request = cards.find((card) => within(card).queryByText('Requested'));
    const payable = cards.find((card) => within(card).queryByText('Awaiting payment'));
    expect(within(request!).queryByRole('link', { name: 'Pay now' })).toBeNull();
    expect(within(request!).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(payable!).getByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      '/customer/pay/ap2',
    );
    expect(within(payable!).getByRole('button', { name: 'Resend link' })).toBeInTheDocument();
  });

  it('cancels after confirming in the dialog', async () => {
    vi.mocked(bookingApi.actOnAppointment).mockResolvedValue({
      ...appointment,
      status: 'cancelled',
    });
    const user = userEvent.setup();
    renderAt('/customer/appointments');
    const cards = await screen.findAllByRole('article');
    const request = cards.find((card) => within(card).queryByText('Requested'))!;
    await user.click(within(request).getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await waitFor(() =>
      expect(bookingApi.actOnAppointment).toHaveBeenCalledWith('ap1', 'cancel', { reason: '' }),
    );
  });

  it('shows an empty state with a way to book', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([]);
    renderAt('/customer/appointments');
    expect(await screen.findByText('No appointments yet')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    vi.mocked(bookingApi.listMyAppointments).mockRejectedValue(new Error('boom'));
    renderAt('/customer/appointments');
    expect(await screen.findByText("We couldn't load your appointments.")).toBeInTheDocument();
  });
});

describe('payment page', () => {
  it('pays through the mock gateway with the emailed link token', async () => {
    vi.mocked(bookingApi.getPayment).mockResolvedValue({
      state: 'due',
      amount: '500.00',
      expires_at: '2026-10-27T14:00:00Z',
      appointment: awaiting,
    });
    vi.mocked(bookingApi.payAppointment).mockResolvedValue({ appointment: awaiting });
    const user = userEvent.setup();
    renderAt('/customer/pay/ap2?link=tok123');
    await user.click(await screen.findByRole('button', { name: /^Pay ₹500/ }));
    await waitFor(() =>
      expect(bookingApi.payAppointment).toHaveBeenCalledWith('ap2', 'success', 'tok123', null),
    );
  });

  it('applies a coupon, shows the coupon and membership lines, and pays the lower amount', async () => {
    const base = {
      state: 'due' as const,
      amount: '1000.00',
      expires_at: '2026-10-27T14:00:00Z',
      appointment: awaiting,
    };
    vi.mocked(bookingApi.getPayment).mockImplementation(async (_id, _link, coupon) =>
      coupon === 'FLAT100'
        ? {
            ...base,
            quote: {
              items_total: '1000.00',
              coupon_code: 'FLAT100',
              coupon_amount: '100.00',
              member_plan: 'Gold',
              member_percent: '10.00',
              member_amount: '90.00',
              discount: '190.00',
              total: '810.00',
            },
            coupon_error: '',
          }
        : coupon
          ? { ...base, coupon_error: 'That coupon code is not valid.' }
          : base,
    );
    vi.mocked(bookingApi.payAppointment).mockResolvedValue({ appointment: awaiting });
    const user = userEvent.setup();
    renderAt('/customer/pay/ap2?link=tok123');
    const box = await screen.findByLabelText(/Coupon code/);
    await user.type(box, 'nope');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('That coupon code is not valid.')).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'flat100');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Coupon FLAT100')).toBeInTheDocument();
    expect(screen.getByText(/Gold membership/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Pay ₹810/ }));
    await waitFor(() =>
      expect(bookingApi.payAppointment).toHaveBeenCalledWith(
        'ap2',
        'success',
        'tok123',
        null,
        'FLAT100',
      ),
    );
  });

  it.each([
    ['expired', 'This payment link has expired'],
    ['replaced', 'This link was replaced by a newer one'],
    ['paid', 'Payment received'],
  ] as const)('explains a %s link', async (state, title) => {
    vi.mocked(bookingApi.getPayment).mockResolvedValue({
      state,
      amount: '500.00',
      expires_at: null,
      appointment: awaiting,
    });
    renderAt('/customer/pay/ap2');
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('is closed to staff', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    renderAt('/customer/pay/ap2');
    await waitFor(() => expect(bookingApi.getPayment).not.toHaveBeenCalled());
  });
});

describe('profile', () => {
  it('shows the marketing choice with its date and saves a change', async () => {
    vi.mocked(bookingApi.getProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      allergies: '',
      preferences: '',
      marketing_opt_in: false,
      marketing_opt_changed_at: null,
    });
    vi.mocked(bookingApi.updateProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      allergies: '',
      preferences: '',
      marketing_opt_in: true,
      marketing_opt_changed_at: '2026-10-27T10:00:00Z',
    });
    const user = userEvent.setup();
    renderAt('/customer/profile');
    const box = await screen.findByRole('checkbox', { name: /Send me offers and news/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/You have not agreed to marketing messages/)).toBeInTheDocument();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(bookingApi.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ marketing_opt_in: true }),
      ),
    );
  });

  it('saves details and validates the phone number', async () => {
    vi.mocked(bookingApi.getProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      allergies: '',
      preferences: '',
      marketing_opt_in: false,
    });
    vi.mocked(bookingApi.updateProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9123456780',
      allergies: 'Latex',
      preferences: '',
      marketing_opt_in: false,
    });
    const user = userEvent.setup();
    renderAt('/customer/profile');
    const phone = await screen.findByLabelText(/Mobile number/);
    await user.clear(phone);
    await user.type(phone, '12345');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument();
    expect(bookingApi.updateProfile).not.toHaveBeenCalled();

    await user.clear(phone);
    await user.type(phone, '+91 91234 56780');
    await user.type(screen.getByLabelText(/Allergies/), 'Latex');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(bookingApi.updateProfile).toHaveBeenCalledWith({
        full_name: 'Test Customer',
        phone: '+91 91234 56780',
        allergies: 'Latex',
        preferences: '',
        marketing_opt_in: false,
      }),
    );
  });

  it('checks that the new passwords match', async () => {
    vi.mocked(bookingApi.getProfile).mockResolvedValue({
      full_name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      allergies: '',
      preferences: '',
      marketing_opt_in: false,
    });
    const user = userEvent.setup();
    renderAt('/customer/profile');
    await user.type(await screen.findByLabelText(/^Current password/), 'old-Pass-1!');
    await user.type(screen.getByLabelText(/^New password/), 'New-Pass-2026!');
    await user.type(screen.getByLabelText(/Repeat new password/), 'Different-2026!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(bookingApi.changePassword).not.toHaveBeenCalled();
  });
});

describe('desk appointments (receptionist and admin)', () => {
  const counts = {
    requested: 1,
    awaiting_payment: 0,
    payment_expired: 0,
    scheduled: 0,
    flags: 0,
    closed: 0,
  };

  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    vi.mocked(deskApi.listDeskAppointments).mockResolvedValue({
      counts,
      results: [deskRequest],
    });
    vi.mocked(deskApi.getConfirmOptions).mockResolvedValue({
      stylists: [
        {
          id: 'st1',
          display_name: 'Rahul',
          title: 'Senior stylist',
          photo_url: '',
          free_at_preferred: true,
          preferred: true,
        },
      ],
      rooms: [{ id: 'r1', name: 'Salon chair 1', division: 'salon' }],
      date: '2026-10-28',
      slots: [SLOT_A],
    });
  });

  it('shows request cards with the customer, allergies and counts', async () => {
    renderAt('/appointments');
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Test Customer')).toBeInTheDocument();
    expect(within(card).getByText(/Latex/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'New requests (1)' })).toBeInTheDocument();
  });

  it('confirms with stylist, time and room', async () => {
    vi.mocked(deskApi.confirmRequest).mockResolvedValue({
      ...deskRequest,
      status: 'awaiting_payment',
    });
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await user.selectOptions(await screen.findByLabelText(/^Stylist/), 'st1');
    await user.selectOptions(screen.getByLabelText(/^Room/), 'r1');
    await user.click(await screen.findByRole('button', { name: /10:00/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm and send payment link' }));
    await waitFor(() =>
      expect(deskApi.confirmRequest).toHaveBeenCalledWith('ap1', {
        stylist: 'st1',
        start: SLOT_A,
        room: 'r1',
      }),
    );
  });

  it('needs a stylist and a time before confirming', async () => {
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await user.selectOptions(await screen.findByLabelText(/^Stylist/), '');
    await user.click(screen.getByRole('button', { name: 'Confirm and send payment link' }));
    expect(await screen.findByText('Choose a stylist.')).toBeInTheDocument();
    expect(deskApi.confirmRequest).not.toHaveBeenCalled();
  });

  it('rejects only with a reason', async () => {
    vi.mocked(deskApi.rejectRequest).mockResolvedValue({ ...deskRequest, status: 'rejected' });
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(await screen.findByRole('button', { name: 'Reject request' }));
    expect(await screen.findByText(/Give a short reason/)).toBeInTheDocument();
    expect(deskApi.rejectRequest).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Reason/), 'Fully booked that day');
    await user.click(screen.getByRole('button', { name: 'Reject request' }));
    await waitFor(() =>
      expect(deskApi.rejectRequest).toHaveBeenCalledWith('ap1', 'Fully booked that day'),
    );
  });

  it('lets an admin use the same page', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    renderAt('/appointments');
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('does not open for customers', async () => {
    vi.mocked(getSession).mockResolvedValue(customer);
    renderAt('/appointments');
    await waitFor(() => expect(deskApi.listDeskAppointments).not.toHaveBeenCalled());
  });
});
