import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession, login, logout, registerCustomer, verifyOtp } from './api/auth';
import { brand, poweredBy } from './config/brand';
import * as publicApi from './api/public';
import * as staffApi from './api/staff';
import { beard, haircut, rahul, site } from './test/fixtures';
import { renderAt } from './test/render';
import { unauthorized, userFor } from './test/session';

vi.mock('./api/auth', () => ({
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

vi.mock('./api/billing', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api/billing')>();
  return {
    ...real,
    listMyInvoices: vi.fn(),
    getPendingRatings: vi.fn().mockResolvedValue({ count: 0, results: [], tags: [] }),
    submitRating: vi.fn(),
  };
});
vi.mock('./api/staff', () => ({
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

vi.mock('./api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));

const meMock = vi.mocked(getSession);
const loginMock = vi.mocked(login);
const registerMock = vi.mocked(registerCustomer);

beforeEach(() => {
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(logout).mockResolvedValue();
  meMock.mockResolvedValue(null); // anonymous by default
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([rahul]);
  vi.mocked(staffApi.listStaff).mockResolvedValue([]);
  vi.mocked(staffApi.listInvites).mockResolvedValue([]);
  vi.mocked(staffApi.listAudit).mockResolvedValue([]);
  vi.mocked(staffApi.getPosSettings).mockResolvedValue({ discount_cap_percent: 20 });
});

describe('public site shell', () => {
  it('opens on the public home page (not login) with the shop brand', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: brand.shopName }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows the full navbar to guests', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await within(nav).findByRole('link', { name: 'Login' });
    for (const name of ['Salon', 'Spa', 'Beauty Parlor', 'Register', 'For Zenotians']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: brand.logoText })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Book Now' })).toHaveAttribute(
      'href',
      '/login?role=customer&intent=book',
    );
  });

  it('shows the platform name only in the powered-by line on customer pages', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: brand.shopName });
    expect(screen.getByText(poweredBy)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(brand.platformName))).toHaveLength(1);
  });

  it.each([
    ['/salon', 'Salon'],
    ['/spa', 'Spa'],
    ['/beauty-parlor', 'Beauty Parlor'],
  ])('renders the %s division shell with an empty state', async (path, label) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    expect(await screen.findByText('No services listed yet')).toBeInTheDocument();
  });

  it('shows the For Zenotians page with the platform name', async () => {
    renderAt('/zenotians');
    expect(
      await screen.findByRole('heading', { level: 1, name: brand.platformName }),
    ).toBeInTheDocument();
  });

  it('shows 404 for unknown routes', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('renders the 403 page', async () => {
    renderAt('/403');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('renders the design system page in development', async () => {
    renderAt('/design-system');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design system' }),
    ).toBeInTheDocument();
  });
});

describe('website content from the database', () => {
  it('shows hero, numbers, team, FAQ and a Call button from the API', async () => {
    renderAt('/');
    expect(await screen.findByText('Look good. Feel calm.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call salon/ })).toHaveAttribute(
      'href',
      'tel:+919000000000',
    );
    expect(await screen.findByRole('heading', { name: 'Meet the team' })).toBeInTheDocument();
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.getByText('When do I pay?')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Demo address, Vijayawada')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy',
    );
  });

  it('opens a division card as a popup sheet', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByText('Look good. Feel calm.');
    await user.click(screen.getByRole('button', { name: /^Salon/ }));
    const dialog = screen.getByRole('dialog', { name: 'Salon' });
    expect(within(dialog).getByRole('link', { name: 'View services' })).toHaveAttribute(
      'href',
      '/salon',
    );
  });

  it('lists services, filters by audience and opens the price sheet', async () => {
    vi.mocked(publicApi.getServices).mockResolvedValue([haircut, beard]);
    const user = userEvent.setup();
    renderAt('/salon');
    expect(await screen.findByText("Women's Haircut")).toBeInTheDocument();
    expect(screen.getByText('₹500')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Men' }));
    await waitFor(() =>
      expect(publicApi.getServices).toHaveBeenLastCalledWith({
        division: 'salon',
        audience: 'men',
        category: undefined,
        q: undefined,
      }),
    );

    await user.click(screen.getByRole('button', { name: /Women's Haircut: see details/ }));
    const sheet = screen.getByRole('dialog', { name: "Women's Haircut" });
    expect(within(sheet).getByText('Long hair')).toBeInTheDocument();
    expect(within(sheet).getByText('₹900')).toBeInTheDocument();
    expect(within(sheet).getByText('Bond-repair treatment')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Sign in to book' })).toHaveAttribute(
      'href',
      `/login?role=customer&next=${encodeURIComponent('/customer/book?service=womens-haircut')}`,
    );
  });

  it('sends a signed-in customer straight to the booking sheet', async () => {
    meMock.mockResolvedValue(userFor('customer'));
    vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
    const user = userEvent.setup();
    renderAt('/salon');
    await user.click(await screen.findByRole('button', { name: /Women's Haircut: see details/ }));
    expect(screen.getByRole('link', { name: 'Book this service' })).toHaveAttribute(
      'href',
      '/customer/book?service=womens-haircut',
    );
  });

  it('explains when filters match nothing', async () => {
    const user = userEvent.setup();
    renderAt('/spa');
    await user.click(await screen.findByRole('button', { name: 'Kids' }));
    expect(await screen.findByText('No services match your filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No services listed yet')).toBeInTheDocument();
  });

  it('shows a policy page from the database', async () => {
    vi.mocked(publicApi.getPolicyPage).mockResolvedValue({
      key: 'cancellation',
      title: 'Cancellation policy',
      body: 'Cancel free up to 24 hours before.\n\nNo fee for missed visits.',
    });
    renderAt('/cancellation-policy');
    expect(await screen.findByText('Cancel free up to 24 hours before.')).toBeInTheDocument();
    expect(screen.getByText('No fee for missed visits.')).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('has four role tabs with Customer selected by default', async () => {
    renderAt('/login');
    const tablist = await screen.findByRole('tablist', { name: 'Sign in as' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Customer',
      'Stylist',
      'Receptionist',
      'Admin',
    ]);
    expect(within(tablist).getByRole('tab', { name: 'Customer' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
  });

  it('staff tabs are sign-in only (no registration link)', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('tab', { name: 'Admin' }));
    expect(screen.getByRole('tab', { name: 'Admin' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in as Admin' })).toBeInTheDocument();
  });

  it('preselects the role from the URL and falls back to Customer', async () => {
    renderAt('/login?role=stylist');
    expect(await screen.findByRole('tab', { name: 'Stylist' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back to Customer for an unknown role in the URL', async () => {
    renderAt('/login?role=superuser');
    expect(await screen.findByRole('tab', { name: 'Customer' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('validates the form before calling the server', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in as Customer' }));
    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('shows the generic error when the server rejects the credentials or the tab', async () => {
    loginMock.mockRejectedValue(unauthorized);
    const user = userEvent.setup();
    renderAt('/login?role=receptionist');
    await user.type(await screen.findByLabelText(/Email/), 'desk@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in as Receptionist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect for this role.',
    );
    expect(loginMock).toHaveBeenCalledWith({
      role: 'receptionist',
      email: 'desk@example.com',
      password: 'wrong-password',
    });
  });

  it('shows the lockout message from the server', async () => {
    loginMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 429,
        data: { detail: 'Too many attempts. Please wait 15 minutes and try again.' },
      },
    });
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(await screen.findByLabelText(/Email/), 'c@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'whatever-123');
    await user.click(screen.getByRole('button', { name: 'Sign in as Customer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('15 minutes');
  });

  it.each([
    ['admin', 'Staff'],
    ['receptionist', 'Schedule'],
  ] as const)('signs a %s in and opens their own dashboard', async (role, menuItem) => {
    loginMock.mockResolvedValue(userFor(role));
    const user = userEvent.setup();
    renderAt(`/login?role=${role}`);
    await user.type(await screen.findByLabelText(/Email/), `${role}@example.com`);
    await user.type(screen.getByLabelText(/^Password/), 'Strong-Pass-2026!');
    await user.click(screen.getByRole('button', { name: new RegExp(`Sign in as`, 'i') }));
    expect(await screen.findByRole('heading', { name: /Welcome, Test/ })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: /menu/ });
    expect(
      within(menu).getByRole('link', { name: new RegExp(`^${menuItem}( Task \\d+)?$`) }),
    ).toBeInTheDocument();
  });

  it('returns to the requested page after sign-in when the role may open it', async () => {
    loginMock.mockResolvedValue(userFor('admin'));
    const user = userEvent.setup();
    renderAt('/login?role=admin&next=%2Fstaff');
    await user.type(await screen.findByLabelText(/Email/), 'admin@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'Strong-Pass-2026!');
    await user.click(screen.getByRole('button', { name: 'Sign in as Admin' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument();
  });
  it('asks a customer for the emailed code, then opens their home', async () => {
    loginMock.mockResolvedValue({
      otp_required: true,
      email: 'customer@example.com',
      purpose: 'login',
      detail: 'We emailed a 6-digit code.',
    });
    vi.mocked(verifyOtp).mockResolvedValue(userFor('customer'));
    const user = userEvent.setup();
    renderAt('/login?role=customer');
    await user.type(await screen.findByLabelText(/Email/), 'customer@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'Strong-Pass-2026!');
    await user.click(screen.getByRole('button', { name: 'Sign in as Customer' }));
    expect(await screen.findByText('We emailed a 6-digit code.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/6-digit code/), '12');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(screen.getByText('Enter the 6-digit code from your email.')).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/6-digit code/), '3456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(verifyOtp).toHaveBeenCalledWith('customer@example.com', '123456', 'login');
    expect(await screen.findByRole('heading', { name: /Welcome, Test/ })).toBeInTheDocument();
  });

  it('uses the registration code when the server says the email is not verified yet', async () => {
    loginMock.mockResolvedValue({
      otp_required: true,
      email: 'customer@example.com',
      purpose: 'register',
      detail: 'We emailed a 6-digit code.',
    });
    vi.mocked(verifyOtp).mockResolvedValue(userFor('customer'));
    const user = userEvent.setup();
    renderAt('/login?role=customer');
    await user.type(await screen.findByLabelText(/Email/), 'customer@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'Strong-Pass-2026!');
    await user.click(screen.getByRole('button', { name: 'Sign in as Customer' }));
    await user.type(await screen.findByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(verifyOtp).toHaveBeenCalledWith('customer@example.com', '123456', 'register');
  });

  it('shows a generic message for a wrong code and lets the customer go back', async () => {
    loginMock.mockResolvedValue({
      otp_required: true,
      email: 'customer@example.com',
      purpose: 'login',
      detail: 'We emailed a 6-digit code.',
    });
    vi.mocked(verifyOtp).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'That code is incorrect or has expired.' } },
    });
    const user = userEvent.setup();
    renderAt('/login?role=customer');
    await user.type(await screen.findByLabelText(/Email/), 'customer@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'Strong-Pass-2026!');
    await user.click(screen.getByRole('button', { name: 'Sign in as Customer' }));
    await user.type(await screen.findByLabelText(/6-digit code/), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByText('That code is incorrect or has expired.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/^Password/)).toBeInTheDocument();
  });
});

describe('route guards and role menus', () => {
  it('sends guests to sign in with the right tab and a return path', async () => {
    renderAt('/my-day');
    expect(await screen.findByRole('tab', { name: 'Stylist' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('blocks a customer from staff pages (403)', async () => {
    meMock.mockResolvedValue(userFor('customer'));
    renderAt('/staff');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('blocks a receptionist from admin-only pages and a stylist from the dashboard', async () => {
    meMock.mockResolvedValue(userFor('receptionist'));
    const first = renderAt('/payroll');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    first.unmount();
    meMock.mockResolvedValue(userFor('stylist'));
    renderAt('/dashboard');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('shows the admin only the admin menu (no chat, no cash close)', async () => {
    meMock.mockResolvedValue(userFor('admin'));
    renderAt('/dashboard');
    const menu = await screen.findByRole('navigation', { name: 'Admin menu' });
    for (const label of ['Dashboard', 'Staff', 'Staff Summary', 'Payroll', 'Settings']) {
      expect(
        within(menu).getByRole('link', { name: new RegExp(`^${label}( Task \\d+)?$`) }),
      ).toBeInTheDocument();
    }
    expect(within(menu).queryByRole('link', { name: /Cash Close/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /Chat/ })).not.toBeInTheDocument();
  });

  it('shows the receptionist their menu without admin items or chat', async () => {
    meMock.mockResolvedValue(userFor('receptionist'));
    renderAt('/dashboard');
    const menu = await screen.findByRole('navigation', { name: 'Receptionist menu' });
    // Only built pages are listed; the rest join the menu as their sub-task is finished.
    for (const label of [
      'Dashboard',
      'Appointments',
      'Schedule',
      'Customers',
      'POS / Billing',
      'Cash Close',
      'Inventory \\(view\\)',
      'My Hours & Pay',
    ]) {
      expect(
        within(menu).getByRole('link', { name: new RegExp(`^${label}( Task \\d+[a-z]?)?$`) }),
      ).toBeInTheDocument();
    }
    for (const label of ['Staff', 'Payroll', 'Settings', 'Stylist Chat']) {
      expect(
        within(menu).queryByRole('link', { name: new RegExp(`^${label}( Task \\d+)?$`) }),
      ).not.toBeInTheDocument();
    }
  });

  it('explains planned pages with their purpose and the task they arrive in', async () => {
    meMock.mockResolvedValue(userFor('admin'));
    renderAt('/payroll');
    expect(await screen.findByText('Payroll arrives in Task 6')).toBeInTheDocument();
    expect(screen.getByText('Generate, adjust, approve and pay payroll.')).toBeInTheDocument();
  });

  it('gives a signed-in customer the account menu instead of Login/Register', async () => {
    meMock.mockResolvedValue(userFor('customer'));
    const user = userEvent.setup();
    renderAt('/customer-dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome, Test' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Account menu' }));
    const menu = screen.getByRole('menu', { name: 'Account menu' });
    for (const label of ['My Appointments', 'Stylist Chat', 'Invoices', 'Profile', 'Logout']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole('menuitem', { name: 'Logout' }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await within(nav).findByRole('link', { name: 'Login' })).toBeInTheDocument();
  });
});

describe('register page', () => {
  it('is for customers only: no role tabs', async () => {
    renderAt('/register');
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('validates, never sends a role, and confirms', async () => {
    registerMock.mockResolvedValue({ detail: 'Thanks! Please sign in.', otpRequired: false });
    const user = userEvent.setup();
    renderAt('/register');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(
      screen.getByText('Please accept the terms and cancellation policy.'),
    ).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Full name/), 'Ananya Rao');
    await user.type(screen.getByLabelText(/^Email/), 'ananya@example.com');
    await user.type(screen.getByLabelText(/Mobile number/), '+91 98765 43210');
    await user.type(screen.getByLabelText(/^Password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the terms/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(registerMock).toHaveBeenCalledWith({
      full_name: 'Ananya Rao',
      email: 'ananya@example.com',
      phone: '9876543210',
      password: 'a-strong-pass',
      consent: true,
      marketing_opt_in: false,
    });
    expect(await screen.findByText('Thanks! Please sign in.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?role=customer',
    );
  });

  it('offers an unticked marketing box and sends the choice only when ticked', async () => {
    registerMock.mockResolvedValue({ detail: 'Thanks!', otpRequired: false });
    const user = userEvent.setup();
    renderAt('/register');
    const box = await screen.findByRole('checkbox', { name: /Send me offers and news/ });
    expect(box).not.toBeChecked();
    await user.type(screen.getByLabelText(/Full name/), 'Ananya Rao');
    await user.type(screen.getByLabelText(/^Email/), 'ananya@example.com');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/^Password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the terms/ }));
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({ consent: true, marketing_opt_in: true }),
    );
  });

  it('verifies the emailed code and signs the new customer in', async () => {
    registerMock.mockResolvedValue({ detail: 'We emailed a 6-digit code.', otpRequired: true });
    vi.mocked(verifyOtp).mockResolvedValue(userFor('customer'));
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(await screen.findByLabelText(/Full name/), 'Ananya Rao');
    await user.type(screen.getByLabelText(/^Email/), 'ananya@example.com');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/^Password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the terms/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(verifyOtp).toHaveBeenCalledWith('ananya@example.com', '654321', 'register');
    expect(await screen.findByRole('heading', { name: /Welcome, Test/ })).toBeInTheDocument();
  });

  it('shows server-side field errors', async () => {
    registerMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { password: ['This password is too common.'] } },
    });
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(await screen.findByLabelText(/Full name/), 'Ananya Rao');
    await user.type(screen.getByLabelText(/^Email/), 'ananya@example.com');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/^Password/), 'password123');
    await user.type(screen.getByLabelText(/Confirm password/), 'password123');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the terms/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
  });
});
