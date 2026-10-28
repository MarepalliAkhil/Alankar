import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as billingApi from '../api/billing';
import * as bookingApi from '../api/booking';
import * as publicApi from '../api/public';
import { options } from '../test/booking-fixtures';
import { haircut, site } from '../test/fixtures';
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
vi.mock('../api/booking', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/booking')>();
  return {
    ...real,
    getBookingOptions: vi.fn(),
    getSlots: vi.fn(),
    sendBookingRequest: vi.fn(),
    listMyAppointments: vi.fn(),
  };
});
vi.mock('../api/billing', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/billing')>();
  return { ...real, listMyInvoices: vi.fn(), getPendingRatings: vi.fn(), submitRating: vi.fn() };
});

const invoice: billingApi.Invoice = {
  id: 'inv1',
  number: 'INV-2026-00001',
  status: 'paid',
  status_label: 'Paid',
  issued_at: '2026-10-28T06:30:00Z',
  service_name: "Women's Haircut",
  visit_start: '2026-10-28T04:30:00Z',
  stylist_name: 'Rahul',
  customer_name: 'Test Customer',
  subtotal: '423.73',
  gst_amount: '76.27',
  total: '500.00',
  prepaid_amount: '500.00',
  balance_paid: '0.00',
  items: [{ description: "Women's Haircut", quantity: 1, unit_price: '423.73', amount: '423.73' }],
};

const pendingOne = {
  count: 1,
  tags: ['Late', 'Rushed'],
  results: [
    {
      id: 'r1',
      service_name: "Women's Haircut",
      visit_start: '2026-10-28T04:30:00Z',
      stylist_name: 'Rahul',
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor('customer'));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(bookingApi.listMyAppointments).mockResolvedValue([]);
  vi.mocked(billingApi.getPendingRatings).mockResolvedValue({ count: 0, results: [], tags: [] });
  vi.mocked(bookingApi.getBookingOptions).mockResolvedValue(options);
});

describe('invoices', () => {
  it('lists invoices and opens one with its lines and GST', async () => {
    vi.mocked(billingApi.listMyInvoices).mockResolvedValue([invoice]);
    const user = userEvent.setup();
    renderAt('/customer/invoices');
    expect(await screen.findByText('INV-2026-00001')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View' }));
    const dialog = await screen.findByRole('dialog', { name: /Invoice INV-2026-00001/ });
    expect(within(dialog).getByText('GST')).toBeInTheDocument();
    expect(within(dialog).getAllByText('₹500').length).toBeGreaterThan(0);
  });

  it('shows an empty state', async () => {
    vi.mocked(billingApi.listMyInvoices).mockResolvedValue([]);
    renderAt('/customer/invoices');
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
  });

  it('is closed to guests', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    renderAt('/customer/invoices');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('is closed to staff', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('receptionist'));
    renderAt('/customer/invoices');
    await waitFor(() => expect(billingApi.listMyInvoices).not.toHaveBeenCalled());
    expect(screen.queryByText('INV-2026-00001')).not.toBeInTheDocument();
  });
});

describe('rate your stylist', () => {
  it('needs stars, and a comment for 1-2 stars', async () => {
    vi.mocked(billingApi.getPendingRatings).mockResolvedValue(pendingOne);
    const user = userEvent.setup();
    renderAt('/customer/appointments');
    await user.click(await screen.findByRole('button', { name: 'Submit rating' }));
    expect(screen.getByText('Choose 1 to 5 stars.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('2 stars'));
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));
    expect(screen.getByText(/tell us what went wrong/)).toBeInTheDocument();
    expect(billingApi.submitRating).not.toHaveBeenCalled();
  });

  it('submits stars, tags and comment, then the prompt goes away', async () => {
    vi.mocked(billingApi.getPendingRatings)
      .mockResolvedValueOnce(pendingOne)
      .mockResolvedValue({ count: 0, results: [], tags: [] });
    vi.mocked(billingApi.submitRating).mockResolvedValue({ detail: 'Thanks', pending: 0 });
    const user = userEvent.setup();
    renderAt('/customer/appointments');
    await user.click(await screen.findByLabelText('2 stars'));
    await user.click(screen.getByRole('button', { name: 'Late' }));
    await user.type(screen.getByLabelText(/What went wrong/), 'Waited 30 minutes');
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));
    await waitFor(() =>
      expect(billingApi.submitRating).toHaveBeenCalledWith('r1', {
        stars: 2,
        comment: 'Waited 30 minutes',
        tags: ['Late'],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Submit rating' })).not.toBeInTheDocument(),
    );
  });

  it('holds back the booking sheet while a visit is unrated', async () => {
    vi.mocked(billingApi.getPendingRatings).mockResolvedValue(pendingOne);
    vi.mocked(bookingApi.getBookingOptions).mockResolvedValue({ ...options, pending_ratings: 1 });
    renderAt('/customer/book?service=womens-haircut');
    expect(await screen.findByRole('button', { name: 'Submit rating' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send booking request' })).not.toBeInTheDocument();
  });
});
