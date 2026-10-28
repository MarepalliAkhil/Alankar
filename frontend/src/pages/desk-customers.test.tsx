import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as customersApi from '../api/customers';
import * as deskApi from '../api/desk';
import * as publicApi from '../api/public';
import { SLOT_A, SLOT_B, scheduledVisit } from '../test/booking-fixtures';
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
vi.mock('../api/customers', () => ({
  searchCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  editCustomer: vi.fn(),
  addCustomerNote: vi.fn(),
  getDeskSlots: vi.fn(),
  createDeskBooking: vi.fn(),
}));
vi.mock('../api/desk', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/desk')>();
  return {
    ...real,
    listDeskAppointments: vi.fn(),
    checkInAppointment: vi.fn(),
  };
});

const priya: customersApi.CustomerSummary = {
  id: 'c1',
  full_name: 'Priya Customer',
  email: 'priya@example.com',
  phone: '9876543210',
  has_allergies: true,
  email_verified: true,
  visits: 2,
};

const profile: customersApi.CustomerDetail = {
  ...priya,
  allergies: 'Latex',
  preferences: 'Morning visits',
  joined: '2026-09-01T08:00:00Z',
  stats: {
    visits: 2,
    no_shows: 1,
    cancellations: 0,
    last_visit: '2026-10-01T05:00:00Z',
    next_visit: null,
    pending_ratings: 1,
  },
  visits_list: [
    {
      id: 'v1',
      status: 'completed',
      status_label: 'Completed',
      service_name: "Women's Haircut",
      variant_label: 'Short hair',
      start: '2026-10-01T05:00:00Z',
      stylist_name: 'Rahul',
      amount: '500.00',
      source: 'online',
      invoice_number: 'INV-2026-0001',
    },
  ],
  notes: [
    {
      id: 'n1',
      body: 'Prefers tea',
      author_name: 'Desk Staff',
      created_at: '2026-10-02T05:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
  vi.mocked(customersApi.searchCustomers).mockResolvedValue({ count: 1, results: [priya] });
  vi.mocked(customersApi.getCustomer).mockResolvedValue(profile);
});

describe('customers list', () => {
  it('lists customers and searches as you type', async () => {
    const user = userEvent.setup();
    renderAt('/customers');
    expect(await screen.findByRole('link', { name: 'Priya Customer' })).toHaveAttribute(
      'href',
      '/customers/c1',
    );
    expect(screen.getByText('Allergies')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search customers'), '9876543210');
    await waitFor(() =>
      expect(customersApi.searchCustomers).toHaveBeenLastCalledWith('9876543210'),
    );
  });

  it('shows an empty state for no match and an error state with retry', async () => {
    vi.mocked(customersApi.searchCustomers).mockResolvedValue({ count: 0, results: [] });
    const user = userEvent.setup();
    const first = renderAt('/customers');
    await user.type(await screen.findByLabelText('Search customers'), 'zzz');
    expect(await screen.findByText('No customers match “zzz”')).toBeInTheDocument();
    first.unmount();
    vi.mocked(customersApi.searchCustomers).mockRejectedValue(new Error('down'));
    renderAt('/customers');
    expect(await screen.findByRole('button', { name: /Try again|Retry/ })).toBeInTheDocument();
  });

  it('registers a customer at the desk and opens the profile', async () => {
    const walkIn = { ...profile, id: 'c9', full_name: 'Walk In' };
    vi.mocked(customersApi.createCustomer).mockResolvedValue(walkIn);
    vi.mocked(customersApi.getCustomer).mockResolvedValue(walkIn);
    const user = userEvent.setup();
    renderAt('/customers');
    await user.click(await screen.findByRole('button', { name: 'Register customer' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Register customer' }));
    expect(within(dialog).getByText('Enter the full name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Full name/), 'Walk In');
    await user.type(within(dialog).getByLabelText(/^Email/), 'walkin@example.com');
    await user.type(within(dialog).getByLabelText(/Mobile number/), '98123 45678');
    await user.click(within(dialog).getByRole('button', { name: 'Register customer' }));
    await waitFor(() =>
      expect(customersApi.createCustomer).toHaveBeenCalledWith({
        full_name: 'Walk In',
        email: 'walkin@example.com',
        phone: '98123 45678',
        allergies: '',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Walk In' })).toBeInTheDocument();
  });

  it('says so when the email is already registered', async () => {
    vi.mocked(customersApi.createCustomer).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: 'A customer or staff member with this email already exists.' },
      },
    });
    const user = userEvent.setup();
    renderAt('/customers');
    await user.click(await screen.findByRole('button', { name: 'Register customer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Full name/), 'Walk In');
    await user.type(within(dialog).getByLabelText(/^Email/), 'walkin@example.com');
    await user.type(within(dialog).getByLabelText(/Mobile number/), '9812345678');
    await user.click(within(dialog).getByRole('button', { name: 'Register customer' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  });
});

describe('customer profile', () => {
  it('shows contact, allergies, history and front-desk notes', async () => {
    renderAt('/customers/c1');
    expect(await screen.findByRole('heading', { name: 'Priya Customer' })).toBeInTheDocument();
    expect(screen.getByText(/priya@example.com · 9876543210/)).toBeInTheDocument();
    expect(screen.getByText('Latex')).toBeInTheDocument();
    expect(screen.getByText(/1 visit to rate/)).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Visit history' });
    expect(within(history).getByText(/Women's Haircut · Short hair/)).toBeInTheDocument();
    expect(within(history).getByText(/INR|₹/)).toBeInTheDocument();
    expect(within(history).getByText(/INV-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText('Prefers tea')).toBeInTheDocument();
    expect(screen.getByText('Staff only')).toBeInTheDocument();
  });

  it('adds a note and refuses an empty one', async () => {
    vi.mocked(customersApi.addCustomerNote).mockResolvedValue(profile);
    const user = userEvent.setup();
    renderAt('/customers/c1');
    await user.click(await screen.findByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Write a short note.')).toBeInTheDocument();
    expect(customersApi.addCustomerNote).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Add a note'), 'Likes a quiet room');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(customersApi.addCustomerNote).toHaveBeenCalledWith('c1', 'Likes a quiet room'),
    );
  });

  it('edits the details', async () => {
    vi.mocked(customersApi.editCustomer).mockResolvedValue(profile);
    const user = userEvent.setup();
    renderAt('/customers/c1');
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    const phone = within(dialog).getByLabelText(/Mobile number/);
    await user.clear(phone);
    await user.type(phone, '123');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    expect(
      await within(dialog).findByText('Enter a valid 10-digit mobile number.'),
    ).toBeInTheDocument();
    await user.clear(phone);
    await user.type(phone, '9000000001');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await waitFor(() =>
      expect(customersApi.editCustomer).toHaveBeenCalledWith('c1', {
        full_name: 'Priya Customer',
        phone: '9000000001',
        allergies: 'Latex',
        preferences: 'Morning visits',
      }),
    );
  });

  it('shows a not-found state for an unknown customer', async () => {
    vi.mocked(customersApi.getCustomer).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    renderAt('/customers/nope');
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
  });

  it('books a walk-in: service, time, stylist, then check in now', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    vi.mocked(customersApi.getDeskSlots).mockResolvedValue({
      date: today,
      duration_minutes: 20,
      price_total: '150.00',
      amount_payable: '150.00',
      stylists: [{ id: 'st1', display_name: 'Rahul', title: 'Senior stylist', photo_url: '' }],
      rooms: [{ id: 'r1', name: 'Salon chair 1', division: 'salon' }],
      slots: [
        { start: SLOT_A, stylists: ['st1'] },
        { start: SLOT_B, stylists: ['st1'] },
      ],
    });
    vi.mocked(customersApi.createDeskBooking).mockResolvedValue({
      ...scheduledVisit,
      status: 'checked_in',
    });
    const user = userEvent.setup();
    renderAt('/customers/c1');
    await user.click(await screen.findByRole('button', { name: 'Book a visit' }));
    const drawer = await screen.findByRole('dialog');
    await user.selectOptions(await within(drawer).findByLabelText(/^Service/), 'beard-trim-shape');
    const [slot] = await within(drawer).findAllByRole('button', { name: /^\d{1,2}:\d{2}/ });
    await user.click(slot);
    await user.selectOptions(within(drawer).getByLabelText(/^Stylist/), 'st1');
    await user.click(within(drawer).getByLabelText(/check them in/));
    await user.click(within(drawer).getByRole('button', { name: 'Book and check in' }));
    await waitFor(() =>
      expect(customersApi.createDeskBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'c1',
          service: 'beard-trim-shape',
          stylist: 'st1',
          source: 'walk_in',
          check_in_now: true,
          variant: null,
        }),
      ),
    );
  });

  it('offers the nearest free times when the chosen time was just taken', async () => {
    vi.mocked(customersApi.getDeskSlots).mockResolvedValue({
      date: '2099-01-01',
      duration_minutes: 20,
      price_total: '150.00',
      amount_payable: '150.00',
      stylists: [{ id: 'st1', display_name: 'Rahul', title: 'Senior stylist', photo_url: '' }],
      rooms: [],
      slots: [{ start: SLOT_A, stylists: ['st1'] }],
    });
    vi.mocked(customersApi.createDeskBooking).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: 'This stylist is already booked at this time.', slots: [SLOT_B] },
      },
    });
    const user = userEvent.setup();
    renderAt('/customers/c1');
    await user.click(await screen.findByRole('button', { name: 'Book a visit' }));
    const drawer = await screen.findByRole('dialog');
    await user.selectOptions(await within(drawer).findByLabelText(/^Service/), 'beard-trim-shape');
    await user.click((await within(drawer).findAllByRole('button', { name: /^\d{1,2}:\d{2}/ }))[0]);
    await user.selectOptions(within(drawer).getByLabelText(/^Stylist/), 'st1');
    await user.click(within(drawer).getByRole('button', { name: 'Book visit' }));
    expect(await within(drawer).findByText('Nearest free times')).toBeInTheDocument();
    expect(within(drawer).getByRole('alert')).toHaveTextContent(/already booked/);
  });
});

describe('check in', () => {
  it('checks a guest in from the appointment card', async () => {
    vi.mocked(deskApi.listDeskAppointments).mockResolvedValue({
      counts: {
        requested: 0,
        awaiting_payment: 0,
        payment_expired: 0,
        scheduled: 1,
        flags: 0,
        closed: 0,
      },
      results: [{ ...scheduledVisit, actions: ['check_in', 'move', 'cancel'] }],
    });
    vi.mocked(deskApi.checkInAppointment).mockResolvedValue({
      ...scheduledVisit,
      status: 'checked_in',
      actions: ['cancel'],
    });
    const user = userEvent.setup();
    renderAt('/appointments');
    await user.click(await screen.findByRole('tab', { name: /Scheduled/ }));
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(deskApi.checkInAppointment).toHaveBeenCalledWith('ap2'));
  });
});

describe('access', () => {
  it('keeps customers and stylists out of the customers pages', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('stylist'));
    const first = renderAt('/customers');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    first.unmount();
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    renderAt('/customers/c1');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(customersApi.searchCustomers).not.toHaveBeenCalled();
    expect(customersApi.getCustomer).not.toHaveBeenCalled();
  });

  it('lets the admin open the same pages', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('admin'));
    renderAt('/customers');
    expect(await screen.findByRole('link', { name: 'Priya Customer' })).toBeInTheDocument();
  });
});
