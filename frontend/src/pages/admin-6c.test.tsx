import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as pr from '../api/payroll';
import * as publicApi from '../api/public';
import * as ss from '../api/staffSummary';
import * as stylistApi from '../api/stylist';
import * as workApi from '../api/work';
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
vi.mock('../api/work', () => ({ getMyHours: vi.fn(), pingActivity: vi.fn() }));
vi.mock('../api/stylist', () => ({ getEarnings: vi.fn(), getRatings: vi.fn() }));
vi.mock('../api/ratingsAdmin', () => ({
  listStylistPay: vi.fn(),
  getStylistPay: vi.fn(),
}));
vi.mock('../api/payroll', () => ({
  listRuns: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  refreshRun: vi.fn(),
  approveRun: vi.fn(),
  payRun: vi.fn(),
  getItem: vi.fn(),
  addAdjustment: vi.fn(),
  voidAdjustment: vi.fn(),
  myPayslips: vi.fn(),
  myPayslip: vi.fn(),
}));
vi.mock('../api/staffSummary', () => ({
  getStaffSummary: vi.fn(),
  getReviews: vi.fn(),
  getReviewHistory: vi.fn(),
  saveReview: vi.fn(),
}));
vi.mock('../components/charts/BarChartView', () => ({
  default: ({ title }: { title: string }) => <div>{`bar: ${title}`}</div>,
}));
vi.mock('../components/charts/LineChartView', () => ({
  default: ({ title }: { title: string }) => <div>{`line: ${title}`}</div>,
}));

type Role = 'admin' | 'receptionist' | 'stylist' | 'customer';
function setup(role: Role = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
}

const run = (over: Partial<pr.RunDetail> = {}): pr.RunDetail => ({
  id: 'r1',
  month: '2026-10',
  status: 'draft',
  status_label: 'Draft',
  created_at: '2026-11-01T04:00:00Z',
  approved_at: null,
  approved_by: '',
  paid_at: null,
  paid_by: '',
  payment_reference: '',
  simulated_payment: true,
  items: [
    {
      id: 'i1',
      name: 'Asha',
      role: 'stylist',
      base_pay: '180.00',
      tips: '40.00',
      adjustments_total: '0.00',
      adjustments: 0,
      net: '220.00',
    },
    {
      id: 'i2',
      name: 'Desk Staff',
      role: 'receptionist',
      base_pay: '800.00',
      tips: '0.00',
      adjustments_total: '0.00',
      adjustments: 0,
      net: '800.00',
    },
  ],
  totals: { base_pay: '980.00', tips: '40.00', adjustments: '0.00', net: '1020.00' },
  checks: {
    tips_on_invoices: '40.00',
    tips_in_run: '40.00',
    invoices_in_month: 2,
    visits_in_run: 2,
    waiting_checkout: 0,
  },
  ...over,
});
const slip = (over: Partial<pr.Payslip> = {}): pr.Payslip => ({
  id: 'i1',
  run: {
    id: 'r1',
    month: '2026-10',
    status: 'draft',
    status_label: 'Draft',
    approved_at: null,
    paid_at: null,
    payment_reference: '',
  },
  name: 'Asha',
  role: 'stylist',
  base_pay: '180.00',
  tips: '40.00',
  adjustments: [],
  adjustments_total: '0.00',
  net: '220.00',
  components: {},
  locked: false,
  ...over,
});
const runRow: pr.RunRow = {
  id: 'r1',
  month: '2026-10',
  status: 'draft',
  status_label: 'Draft',
  staff: 2,
  net: '1020.00',
  approved_at: null,
  paid_at: null,
};

describe('admin payroll runs', () => {
  beforeEach(() => {
    setup();
    vi.mocked(pr.listRuns).mockResolvedValue([runRow]);
    vi.mocked(pr.getRun).mockResolvedValue(run());
    vi.mocked(pr.getItem).mockResolvedValue(slip());
  });

  it('opens a draft run with every line, the checks and the simulated-payment note', async () => {
    const user = userEvent.setup();
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    const table = await screen.findByRole('table', { name: 'Pay lines for October 2026' });
    expect(within(table).getByText('Asha')).toBeInTheDocument();
    expect(within(table).getByText('Desk Staff')).toBeInTheDocument();
    expect(
      screen.getByText(/tips on invoices ₹40\.00, tips in this run ₹40\.00/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Payment is simulated/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Recalculate' })).toBeInTheDocument();
  });

  it('creates a draft for a month and shows the server message when one already exists', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.createRun).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'A payroll run for this month already exists.' } },
    });
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Create draft run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
    vi.mocked(pr.createRun).mockResolvedValueOnce(run());
    await user.click(screen.getByRole('button', { name: 'Create draft run' }));
    await waitFor(() => expect(pr.createRun).toHaveBeenCalledTimes(2));
  });

  it('adds a bonus or deduction with a reason, kept as its own line', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.addAdjustment).mockResolvedValue(slip());
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    await user.click(await screen.findByRole('button', { name: 'Payslip for Asha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Payslip for Asha' });
    await user.click(within(dialog).getByRole('button', { name: 'Add line' }));
    expect(await within(dialog).findByText('Enter an amount above zero.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'deduction');
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '50');
    await user.type(within(dialog).getByLabelText('Reason'), 'Broken scissors');
    await user.click(within(dialog).getByRole('button', { name: 'Add line' }));
    await waitFor(() =>
      expect(pr.addAdjustment).toHaveBeenCalledWith('i1', {
        kind: 'deduction',
        amount: '50',
        reason: 'Broken scissors',
      }),
    );
  });

  it('shows adjustments as separate payslip lines and a voided one struck through', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.getItem).mockResolvedValue(
      slip({
        adjustments: [
          {
            id: 'a1',
            kind: 'bonus',
            kind_label: 'Bonus',
            amount: '100.00',
            reason: 'Festival rush',
            created_at: '2026-11-02T04:00:00Z',
            created_by: 'Owner',
            after_approval: false,
            voided: false,
            void_reason: '',
          },
          {
            id: 'a2',
            kind: 'deduction',
            kind_label: 'Deduction',
            amount: '30.00',
            reason: 'Entered twice',
            created_at: '2026-11-02T04:00:00Z',
            created_by: 'Owner',
            after_approval: false,
            voided: true,
            void_reason: 'mistake',
          },
        ],
        adjustments_total: '100.00',
        net: '320.00',
      }),
    );
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    await user.click(await screen.findByRole('button', { name: 'Payslip for Asha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Payslip for Asha' });
    expect(
      within(dialog).getByText('Task payouts (after the rating multiplier)'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Tips')).toBeInTheDocument();
    const lines = within(dialog).getByRole('table', { name: 'Pay lines' });
    expect(within(lines).getByText(/Bonus: Festival rush/)).toBeInTheDocument();
    expect(within(lines).getByText(/Deduction: Entered twice/)).toHaveClass('line-through');
    expect(within(lines).getByText('₹320.00')).toBeInTheDocument();
  });

  it('asks before approving, and an approved run has no Recalculate', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.approveRun).mockResolvedValue(
      run({ status: 'approved', status_label: 'Approved' }),
    );
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    await user.click(await screen.findByRole('button', { name: 'Approve run' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this payroll run?' });
    expect(pr.approveRun).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Yes, approve and lock' }));
    await waitFor(() => expect(pr.approveRun).toHaveBeenCalledWith('r1'));
  });

  it('locks an approved run, offers Mark as paid, and a paid run offers nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.getRun).mockResolvedValue(
      run({
        status: 'approved',
        status_label: 'Approved',
        approved_by: 'Owner',
        approved_at: '2026-11-02T04:00:00Z',
      }),
    );
    vi.mocked(pr.payRun).mockResolvedValue(run({ status: 'paid', status_label: 'Paid' }));
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    expect(await screen.findByText(/The lines are locked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve run' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark this run as paid' });
    await user.type(within(dialog).getByLabelText('Payment reference (optional)'), 'NEFT123');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm paid' }));
    await waitFor(() => expect(pr.payRun).toHaveBeenCalledWith('r1', 'NEFT123'));
  });

  it('a paid run cannot be changed from the screen', async () => {
    const user = userEvent.setup();
    vi.mocked(pr.getRun).mockResolvedValue(
      run({
        status: 'paid',
        status_label: 'Paid',
        paid_by: 'Owner',
        paid_at: '2026-11-03T04:00:00Z',
      }),
    );
    vi.mocked(pr.getItem).mockResolvedValue(
      slip({ run: { ...slip().run, status: 'paid', status_label: 'Paid' }, locked: true }),
    );
    renderAt('/payroll');
    await user.click(await screen.findByRole('button', { name: 'Open run for October 2026' }));
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Payslip for Asha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Payslip for Asha' });
    expect(within(dialog).getByText(/This run is paid/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add line' })).not.toBeInTheDocument();
  });

  it('is not available to other roles', async () => {
    for (const role of ['receptionist', 'stylist', 'customer'] as const) {
      setup(role);
      const view = renderAt('/payroll');
      expect(
        await screen.findByText(/not allowed|isn.t available|403|cannot/i),
      ).toBeInTheDocument();
      expect(pr.listRuns).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});

const bucket = (over: Partial<ss.Bucket> = {}): ss.Bucket => ({
  bucket: '2026-10-05',
  appointments: 3,
  revenue: '900.00',
  no_shows: 1,
  avg_rating: '4.50',
  rating_count: 2,
  hours: '0.00',
  ...over,
});
const rebook: ss.RebookingIndicator = {
  level: 'no_data',
  rule: 'Good from 40%',
  customers: 3,
  rebooked: 0,
  enough: false,
  rate: null,
  label: 'Not enough data',
};
const summary = (): ss.StaffSummary => ({
  range: { start: '2026-10-01', end: '2026-10-27', bucket: 'week' },
  team: {
    kpis: {
      appointments: 3,
      revenue: '900.00',
      avg_rating: '4.50',
      rating_count: 2,
      no_shows: 1,
      hours: '12.00',
      stylist_earnings: '300.00',
      receptionist_pay: '2400.00',
      payroll_cost: '2700.00',
    },
    series: [bucket()],
  },
  stylists: [
    {
      id: 's1',
      name: 'Asha',
      active: true,
      kpis: {
        appointments: 3,
        revenue: '900.00',
        avg_rating: '4.50',
        rating_count: 2,
        no_shows: 1,
        earnings: '300.00',
        tips: '40.00',
        rebooking: rebook,
        punctuality: {
          level: 'good',
          rule: 'x',
          days: 2,
          on_time: 2,
          late: 0,
          rate: '100.0',
        },
      },
      series: [bucket()],
    },
  ],
  receptionists: [
    {
      id: 'u1',
      name: 'Desk Staff',
      active: true,
      kpis: {
        hours: '12.00',
        sessions: 3,
        pay: '2400.00',
        flagged_sessions: 1,
        corrected_sessions: 0,
        on_time_rate: null,
        has_shifts: false,
      },
      series: [{ bucket: '2026-10-05', hours: '12.00' }],
    },
  ],
});
const person = (over: Partial<ss.ReviewPerson> = {}): ss.ReviewPerson => ({
  id: 's1',
  name: 'Asha',
  role: 'stylist',
  active: true,
  indicators: {
    kind: 'stylist',
    completed_tasks: 3,
    no_shows: 1,
    rating: { level: 'good', rule: 'Good from 4.0', average: '4.50', count: 2 },
    punctuality: {
      level: 'no_data',
      rule: 'Good from 90%',
      days: 0,
      on_time: 0,
      late: 0,
      rate: null,
    },
    rebooking: rebook,
  },
  review: null,
  ...over,
});

describe('admin staff summary', () => {
  beforeEach(() => {
    setup();
    vi.mocked(ss.getStaffSummary).mockResolvedValue(summary());
    vi.mocked(ss.getReviews).mockResolvedValue({
      month: '2026-10',
      people: [person()],
      statuses: [
        { value: 'continue', label: 'Continue' },
        { value: 'notice', label: 'Put on notice' },
        { value: 'recommend_end', label: 'Recommend ending the job' },
      ],
    });
    vi.mocked(ss.getReviewHistory).mockResolvedValue([]);
  });

  it('shows team numbers and graphs, and a month or date-range filter', async () => {
    const user = userEvent.setup();
    renderAt('/staff-summary');
    expect(await screen.findByText('Staff cost')).toBeInTheDocument();
    expect(screen.getByText('₹2,700.00')).toBeInTheDocument();
    expect(
      await screen.findByText('bar: Appointments done and no-shows for the team'),
    ).toBeInTheDocument();
    expect(screen.getByText('line: Average rating over time for the team')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Period'), 'range');
    await waitFor(() =>
      expect(vi.mocked(ss.getStaffSummary).mock.calls.at(-1)?.[0]).toHaveProperty('start'),
    );
    expect(vi.mocked(ss.getStaffSummary).mock.calls.at(-1)?.[0]).toHaveProperty('end');
  });

  it('shows one stylist with "Not enough data" for rebooking, and one receptionist', async () => {
    const user = userEvent.setup();
    renderAt('/staff-summary');
    await user.click(await screen.findByRole('tab', { name: 'Stylists' }));
    expect(await screen.findByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('bar: Revenue for Asha')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Receptionists' }));
    expect(await screen.findByText('No shift set')).toBeInTheDocument();
    expect(screen.getByText('bar: Hours worked by Desk Staff')).toBeInTheDocument();
  });

  it('shows a bad range message from the server', async () => {
    vi.mocked(ss.getStaffSummary).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'Choose at most 366 days.' } },
    });
    renderAt('/staff-summary');
    expect(await screen.findByText(/Choose at most 366 days/)).toBeInTheDocument();
  });

  it('shows indicators with their rules and saves a review with notes', async () => {
    const user = userEvent.setup();
    vi.mocked(ss.saveReview).mockResolvedValue({
      id: 'p1',
      month: '2026-10',
      status: 'notice',
      status_label: 'Put on notice',
      notes: 'Late twice',
      decided_by: 'Owner',
      updated_at: '2026-11-01T00:00:00Z',
    });
    renderAt('/staff-summary');
    await user.click(await screen.findByRole('tab', { name: 'Performance Review' }));
    expect(await screen.findByText('Rule: Good from 4.0')).toBeInTheDocument();
    expect(screen.getByText(/visible to the admin only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review Asha' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'notice');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByText(/Write your notes for this decision/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Admin notes (private)'), 'Late twice');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    await waitFor(() =>
      expect(ss.saveReview).toHaveBeenCalledWith('s1', {
        month: expect.stringMatching(/^\d{4}-\d{2}$/),
        status: 'notice',
        notes: 'Late twice',
      }),
    );
  });

  it('is not available to other roles', async () => {
    for (const role of ['receptionist', 'stylist', 'customer'] as const) {
      setup(role);
      const view = renderAt('/staff-summary');
      expect(
        await screen.findByText(/not allowed|isn.t available|403|cannot/i),
      ).toBeInTheDocument();
      expect(ss.getStaffSummary).not.toHaveBeenCalled();
      expect(ss.getReviews).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});

describe('own payslips', () => {
  const rows: pr.PayslipRow[] = [
    { id: 'p1', month: '2026-09', status: 'paid', status_label: 'Paid', net: '700.00' },
  ];
  beforeEach(() => {
    setup('stylist');
    vi.mocked(pr.myPayslips).mockResolvedValue(rows);
    vi.mocked(pr.myPayslip).mockResolvedValue(
      slip({
        id: 'p1',
        run: { ...slip().run, month: '2026-09', status: 'paid', status_label: 'Paid' },
        net: '700.00',
      }),
    );
    vi.mocked(stylistApi.getEarnings).mockRejectedValue(new Error('not needed'));
    vi.mocked(stylistApi.getRatings).mockRejectedValue(new Error('not needed'));
  });

  it('lists only the signed-in stylist’s payslips and prints from the payslip view', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderAt('/earnings');
    await user.click(
      await screen.findByRole('button', { name: 'View payslip for September 2026' }),
    );
    expect(await screen.findByRole('article', { name: 'Payslip Asha' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print payslip' }));
    expect(print).toHaveBeenCalled();
    expect(pr.myPayslips).toHaveBeenCalled();
    expect(pr.getRun).not.toHaveBeenCalled();
  });

  it('says plainly when there is no payslip yet', async () => {
    vi.mocked(pr.myPayslips).mockResolvedValue([]);
    renderAt('/earnings');
    expect(await screen.findByText(/No payslips yet/)).toBeInTheDocument();
  });
});
