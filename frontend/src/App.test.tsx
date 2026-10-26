import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { login, registerCustomer } from './api/auth';
import { brand, poweredBy } from './config/brand';
import { renderAt } from './test/render';

vi.mock('./api/auth', () => ({ login: vi.fn(), registerCustomer: vi.fn() }));
const loginMock = vi.mocked(login);
const registerMock = vi.mocked(registerCustomer);

describe('public site shell', () => {
  it('opens on the public home page (not login) with the shop brand', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: brand.shopName }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows the full navbar', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const name of ['Salon', 'Spa', 'Beauty Parlor', 'Login', 'Register', 'For Zenotians']) {
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
    expect(screen.getByText('No services listed yet')).toBeInTheDocument();
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
  });

  it('staff tabs are sign-in only (no registration link)', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('tab', { name: 'Admin' }));
    expect(screen.getByRole('tab', { name: 'Admin' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in as Admin' })).toBeInTheDocument();
  });

  it('preselects the role from the URL', async () => {
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
    const spy = loginMock;
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in as Customer' }));
    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a generic error when the server rejects the credentials', async () => {
    loginMock.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
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
});

describe('register page', () => {
  it('is for customers only: no role tabs', async () => {
    renderAt('/register');
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows validation errors and never sends a role', async () => {
    const spy = registerMock.mockResolvedValue();
    const user = userEvent.setup();
    renderAt('/register');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(
      screen.getByText('Please accept the terms and cancellation policy.'),
    ).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Full name/), 'Ananya Rao');
    await user.type(screen.getByLabelText(/^Email/), 'ananya@example.com');
    await user.type(screen.getByLabelText(/Mobile number/), '+91 98765 43210');
    await user.type(screen.getByLabelText(/^Password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(spy).toHaveBeenCalledWith({
      name: 'Ananya Rao',
      email: 'ananya@example.com',
      phone: '9876543210',
      password: 'a-strong-pass',
      consent: true,
    });
  });
});
