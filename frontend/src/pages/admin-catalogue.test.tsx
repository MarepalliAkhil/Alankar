import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin';
import { ensureCsrf, getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as staffApi from '../api/staff';
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
vi.mock('../api/staff', () => ({
  listStaff: vi.fn(),
  listInvites: vi.fn(),
  listAudit: vi.fn(),
  createInvite: vi.fn(),
  resendInvite: vi.fn(),
  deactivateStaff: vi.fn(),
  reactivateStaff: vi.fn(),
  setHourlyRate: vi.fn(),
  getPosSettings: vi.fn(),
  setPosSettings: vi.fn(),
}));
vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  getCatalogueOptions: vi.fn(),
  listAdminServices: vi.fn(),
  listAdminCategories: vi.fn(),
  listAdminRooms: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
  getStaffDetails: vi.fn(),
  updateStaffDetails: vi.fn(),
  linkStaffProfile: vi.fn(),
  listDaysOff: vi.fn(),
  decideDayOff: vi.fn(),
}));

const options = {
  divisions: [
    { value: 'salon', label: 'Salon' },
    { value: 'spa', label: 'Spa' },
  ],
  audiences: [
    { value: 'unisex', label: 'Everyone' },
    { value: 'women', label: 'Women' },
  ],
};

const category: adminApi.AdminCategory = {
  id: 'c1',
  division: 'salon',
  name: 'Hair',
  slug: 'salon-hair',
  sort_order: 0,
  is_active: true,
  service_count: 1,
};

const service: adminApi.AdminService = {
  id: 's1',
  category: 'c1',
  category_name: 'Hair',
  division: 'salon',
  name: 'Haircut',
  slug: 'haircut',
  summary: 'A cut',
  description: '',
  audience: 'unisex',
  duration_minutes: 30,
  price: '300.00',
  gst_percent: null,
  task_payout: '90.00',
  image_url: '',
  tags: [],
  is_active: true,
  sort_order: 0,
  variants: [],
  addons: [],
  visits: 4,
};

const stylist: staffApi.StaffMember = {
  id: 'u1',
  email: 'asha@example.com',
  full_name: 'Asha Rao',
  role: 'stylist',
  is_active: true,
  status: 'active',
  date_joined: '2026-01-01T00:00:00Z',
  hourly_rate: null,
};

const details: adminApi.StaffDetails = {
  user_id: 'u1',
  role: 'stylist',
  full_name: 'Asha Rao',
  email: 'asha@example.com',
  profile: {
    id: 'p1',
    display_name: 'Asha',
    title: 'Senior stylist',
    specialization: '',
    bio: '',
    photo_url: '',
    divisions: ['salon'],
    service_ids: [],
    is_public: true,
    weekly_hours: {},
    effective_hours: {
      mon: ['10:00', '20:00'],
      tue: ['10:00', '20:00'],
      wed: ['10:00', '20:00'],
      thu: ['10:00', '20:00'],
      fri: ['10:00', '20:00'],
      sat: ['10:00', '20:00'],
      sun: null,
    },
  },
  services: [{ id: 's1', name: 'Haircut', division: 'salon', category: 'Hair', is_active: true }],
  divisions: options.divisions,
  unlinked_profiles: [],
};

const request: adminApi.DayOffRow = {
  id: 'd1',
  stylist: { id: 'p1', name: 'Asha' },
  start_date: '2026-11-02',
  end_date: '2026-11-03',
  reason: 'Family event',
  status: 'pending',
  status_label: 'Waiting',
  decision_note: '',
  decided_by: '',
  decided_at: null,
  created_at: '2026-10-20T00:00:00Z',
  conflicts: [],
};

function setup(role: 'admin' | 'customer' | 'stylist' | 'receptionist' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(adminApi.getCatalogueOptions).mockResolvedValue(options);
  vi.mocked(adminApi.listAdminServices).mockResolvedValue([service]);
  vi.mocked(adminApi.listAdminCategories).mockResolvedValue([category]);
  vi.mocked(adminApi.listAdminRooms).mockResolvedValue([]);
  vi.mocked(staffApi.listStaff).mockResolvedValue([stylist]);
  vi.mocked(staffApi.listInvites).mockResolvedValue([]);
  vi.mocked(staffApi.listAudit).mockResolvedValue([]);
  vi.mocked(staffApi.getPosSettings).mockResolvedValue({ discount_cap_percent: 10 });
  vi.mocked(adminApi.getStaffDetails).mockResolvedValue(details);
  vi.mocked(adminApi.listDaysOff).mockResolvedValue([request]);
}

describe('services page (admin)', () => {
  beforeEach(() => setup());

  it('lists services with GST and payout, and saves an edit', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.updateService).mockResolvedValue({ ...service, price: '350.00' });
    renderAt('/services');
    expect(await screen.findByRole('heading', { name: 'Services' })).toBeInTheDocument();
    expect(await screen.findByText('Salon rate')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Edit Haircut/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit service' });
    const price = within(dialog).getByLabelText(/Price/);
    await user.clear(price);
    await user.type(price, '350');
    await user.click(within(dialog).getByRole('button', { name: 'Save service' }));
    await waitFor(() => expect(adminApi.updateService).toHaveBeenCalled());
    const [id, body] = vi.mocked(adminApi.updateService).mock.calls[0];
    expect(id).toBe('s1');
    expect(body).toMatchObject({ price: '350', gst_percent: null, task_payout: '90.00' });
  });

  it('checks a new service before sending it', async () => {
    const user = userEvent.setup();
    renderAt('/services');
    await user.click(await screen.findByRole('button', { name: 'Add a service' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a service' });
    await user.click(within(dialog).getByRole('button', { name: 'Save service' }));
    expect(await within(dialog).findByText('Choose a category.')).toBeInTheDocument();
    expect(adminApi.createService).not.toHaveBeenCalled();
  });

  it('will not delete a service that has visits', async () => {
    const user = userEvent.setup();
    renderAt('/services');
    await user.click(await screen.findByRole('button', { name: /Delete Haircut/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/4 visit\(s\) on record/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('hides a service without deleting it', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.updateService).mockResolvedValue({ ...service, is_active: false });
    renderAt('/services');
    await user.click(await screen.findByRole('button', { name: /Hide Haircut/ }));
    await waitFor(() =>
      expect(adminApi.updateService).toHaveBeenCalledWith('s1', { is_active: false }),
    );
  });

  it('keeps a category with services from being deleted', async () => {
    const user = userEvent.setup();
    renderAt('/services');
    await user.click(await screen.findByRole('tab', { name: 'Categories' }));
    expect(await screen.findByRole('button', { name: /Delete Hair/ })).toBeDisabled();
  });
});

describe.each(['customer', 'stylist', 'receptionist'] as const)('services page as %s', (role) => {
  it('is not available', async () => {
    setup(role);
    renderAt('/services');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Services' })).toBeNull());
    expect(adminApi.listAdminServices).not.toHaveBeenCalled();
  });
});

describe('staff details and days off (admin)', () => {
  beforeEach(() => setup());

  it("saves a stylist's hours, services and visibility", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.updateStaffDetails).mockResolvedValue(details);
    renderAt('/staff');
    await user.click(await screen.findByRole('button', { name: /Edit details for Asha Rao/ }));
    const dialog = await screen.findByRole('dialog', { name: /Edit Asha Rao/ });
    await user.click(await within(dialog).findByLabelText(/Haircut · Hair/));
    await user.selectOptions(within(dialog).getByLabelText('Monday hours'), 'off');
    await user.selectOptions(within(dialog).getByLabelText('Tuesday hours'), 'custom');
    await user.clear(within(dialog).getByLabelText('Tuesday start'));
    await user.type(within(dialog).getByLabelText('Tuesday start'), '12:00');
    await user.click(within(dialog).getByLabelText('Show on the public Team page'));
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(adminApi.updateStaffDetails).toHaveBeenCalled());
    const [id, patch] = vi.mocked(adminApi.updateStaffDetails).mock.calls[0];
    expect(id).toBe('u1');
    expect(patch.service_ids).toEqual(['s1']);
    expect(patch.is_public).toBe(false);
    expect(patch.weekly_hours).toEqual({ mon: null, tue: ['12:00', '20:00'] });
  });

  it('rejects hours that end before they start', async () => {
    const user = userEvent.setup();
    renderAt('/staff');
    await user.click(await screen.findByRole('button', { name: /Edit details for Asha Rao/ }));
    const dialog = await screen.findByRole('dialog', { name: /Edit Asha Rao/ });
    await user.selectOptions(await within(dialog).findByLabelText('Monday hours'), 'custom');
    await user.clear(within(dialog).getByLabelText('Monday end'));
    await user.type(within(dialog).getByLabelText('Monday end'), '09:00');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    expect(
      await within(dialog).findByText(/Monday: the end time must be after/),
    ).toBeInTheDocument();
    expect(adminApi.updateStaffDetails).not.toHaveBeenCalled();
  });

  it('approves a request, and asks first when visits are in the way', async () => {
    const user = userEvent.setup();
    const conflict = {
      isAxiosError: true,
      response: { status: 409, data: { code: 'visits', detail: 'Visits are booked.' } },
    };
    vi.mocked(adminApi.listDaysOff).mockResolvedValue([
      {
        ...request,
        conflicts: [
          {
            id: 'v1',
            start: '2026-11-02T05:00:00Z',
            service_name: 'Haircut',
            customer_name: 'Priya',
            status_label: 'Scheduled',
          },
        ],
      },
    ]);
    vi.mocked(adminApi.decideDayOff)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ ...request, status: 'approved', status_label: 'Approved' });
    renderAt('/staff');
    expect(await screen.findByText('1 waiting')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Approve Asha/ }));
    const warning = await screen.findByRole('dialog', { name: 'There are visits on those days' });
    expect(within(warning).getByText(/Priya/)).toBeInTheDocument();
    await user.click(within(warning).getByRole('button', { name: 'Approve anyway' }));
    await waitFor(() => expect(adminApi.decideDayOff).toHaveBeenCalledTimes(2));
    expect(vi.mocked(adminApi.decideDayOff).mock.calls[1][1]).toMatchObject({
      decision: 'approve',
      acknowledge_conflicts: true,
    });
  });

  it('needs a reason to decline', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.decideDayOff).mockResolvedValue({
      ...request,
      status: 'declined',
      status_label: 'Declined',
    });
    renderAt('/staff');
    await user.click(await screen.findByRole('button', { name: /Decline Asha/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline this request?' });
    await user.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    expect(await within(dialog).findByText('Give a short reason.')).toBeInTheDocument();
    expect(adminApi.decideDayOff).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Busy week');
    await user.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    await waitFor(() =>
      expect(adminApi.decideDayOff).toHaveBeenCalledWith('d1', {
        decision: 'decline',
        reason: 'Busy week',
        acknowledge_conflicts: undefined,
      }),
    );
  });
});
