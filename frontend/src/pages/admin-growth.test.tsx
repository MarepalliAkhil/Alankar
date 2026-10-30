import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCsrf, getSession } from '../api/auth';
import * as contentApi from '../api/content';
import * as customersApi from '../api/customers';
import * as marketingApi from '../api/marketing';
import * as publicApi from '../api/public';
import * as reportsApi from '../api/reports';
import * as workApi from '../api/work';
import { haircut, site } from '../test/fixtures';
import { fullContent } from '../test/zenotians-fixture';
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
vi.mock('../api/content', () => ({
  listBlocks: vi.fn(),
  getPreview: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
  publishBlock: vi.fn(),
  unpublishBlock: vi.fn(),
  listFaqs: vi.fn(),
  createFaq: vi.fn(),
  updateFaq: vi.fn(),
  deleteFaq: vi.fn(),
  listAchievements: vi.fn(),
  createAchievement: vi.fn(),
  updateAchievement: vi.fn(),
  deleteAchievement: vi.fn(),
}));
vi.mock('../api/marketing', () => ({
  listOffers: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  deleteOffer: vi.fn(),
  listCoupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  getLoyalty: vi.fn(),
  saveLoyalty: vi.fn(),
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  sendCampaign: vi.fn(),
  scheduleCampaign: vi.fn(),
  unscheduleCampaign: vi.fn(),
  runDueCampaigns: vi.fn(),
  listPrivateCoupons: vi.fn(),
  issuePrivateCoupons: vi.fn(),
  withdrawPrivateCoupon: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../api/customers', () => ({ searchCustomers: vi.fn() }));
vi.mock('../api/reports', () => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
  downloadReport: vi.fn(),
}));
// Recharts needs the real browser; here the chart is just a labelled box.
vi.mock('../components/charts/BarChartView', () => ({
  default: ({ title }: { title: string }) => <div>{`chart: ${title}`}</div>,
}));

const hero: contentApi.ContentBlock<'hero'> = {
  key: 'hero',
  label: 'Home page banner',
  can_unpublish: false,
  published: { headline: 'Look good. Feel calm.', subtitle: 'Hair, spa and beauty.' },
  draft: null,
  has_draft: false,
  is_published: true,
  published_at: null,
};
const about: contentApi.ContentBlock<'about'> = {
  ...(hero as unknown as contentApi.ContentBlock<'about'>),
  key: 'about',
  label: 'About us',
  published: { heading: 'About us', body: 'We are a salon.' },
};
const announcements: contentApi.ContentBlock<'announcements'> = {
  key: 'announcements',
  label: 'Announcement banner',
  can_unpublish: true,
  published: { items: [{ text: 'Open on Diwali' }] },
  draft: null,
  has_draft: false,
  is_published: true,
  published_at: null,
};
const zenotians: contentApi.ContentBlock<'zenotians'> = {
  key: 'zenotians',
  label: 'For Zenotians page',
  can_unpublish: true,
  published: {},
  draft: null,
  has_draft: false,
  is_published: false,
  published_at: null,
};

const coupon: marketingApi.CouponRow = {
  id: 'c1',
  code: 'WELCOME10',
  name: 'Welcome',
  kind: 'percent',
  value: '10.00',
  min_bill: '0.00',
  max_discount: '200.00',
  starts_on: null,
  ends_on: null,
  total_limit: 100,
  per_customer_limit: 1,
  applies_to: 'all',
  stackable: false,
  is_active: true,
  used: 3,
  state: 'live',
};
const campaign: marketingApi.CampaignRow = {
  id: 'k1',
  name: 'Diwali',
  subject: 'Diwali offers',
  body: 'Come and glow with us.',
  audience: 'all',
  audience_label: 'All opted-in customers',
  coupon: null,
  status: 'draft',
  scheduled_for: null,
  sent_at: null,
  recipients: null,
  would_reach: 4,
  created_at: '2026-10-20T10:00:00Z',
};

const revenue: reportsApi.Report = {
  key: 'revenue-by-day',
  label: 'Revenue by day',
  from: '2026-10-01',
  to: '2026-10-02',
  columns: [
    { key: 'date', label: 'Day', kind: 'text' },
    { key: 'bills', label: 'Bills', kind: 'number' },
    { key: 'revenue', label: 'Revenue (before GST)', kind: 'money' },
  ],
  rows: [
    { date: '2026-10-01', bills: 2, revenue: '1000.00' },
    { date: '2026-10-02', bills: 1, revenue: '500.00' },
  ],
  totals: { date: 'Total', bills: 3, revenue: '1500.00' },
  chart: { kind: 'bar', x: 'date', y: 'revenue' },
};

function setup(role: 'admin' | 'customer' | 'stylist' | 'receptionist' = 'admin') {
  vi.resetAllMocks();
  vi.mocked(ensureCsrf).mockResolvedValue();
  vi.mocked(getSession).mockResolvedValue(userFor(role));
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getServices).mockResolvedValue([haircut]);
  vi.mocked(workApi.pingActivity).mockResolvedValue({ idle_minutes: 15 });
  vi.mocked(contentApi.listBlocks).mockResolvedValue([hero, about, announcements, zenotians]);
  vi.mocked(contentApi.listFaqs).mockResolvedValue([
    {
      id: 1,
      question: 'Do you take walk-ins?',
      answer: 'Yes, when we have space.',
      tags: [],
      show_in_faq: true,
      published: false,
      is_active: false,
      sort_order: 0,
    },
  ]);
  vi.mocked(contentApi.listAchievements).mockResolvedValue([]);
  vi.mocked(marketingApi.listCoupons).mockResolvedValue([coupon]);
  vi.mocked(marketingApi.listOffers).mockResolvedValue([]);
  vi.mocked(marketingApi.listPrivateCoupons).mockResolvedValue([]);
  vi.mocked(marketingApi.getLoyalty).mockResolvedValue({
    loyalty_points_per_100: 1,
    loyalty_point_value: 1,
    loyalty_max_redeem_percent: 50,
  });
  vi.mocked(marketingApi.listCampaigns).mockResolvedValue({
    opted_in: 4,
    audiences: [{ value: 'all', label: 'All opted-in customers' }],
    results: [campaign],
  });
  vi.mocked(reportsApi.listReports).mockResolvedValue([
    { key: 'revenue-by-day', label: 'Revenue by day' },
    { key: 'top-customers', label: 'Top customers' },
  ]);
  vi.mocked(reportsApi.getReport).mockResolvedValue(revenue);
}

describe('website content editor', () => {
  beforeEach(() => setup());

  it('keeps edits as a draft and publishes only after the draft is saved', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.saveDraft).mockResolvedValue({ ...hero, has_draft: true });
    vi.mocked(contentApi.publishBlock).mockResolvedValue(hero);
    renderAt('/content');
    const headline = await screen.findByLabelText('Headline');
    const publish = screen.getAllByRole('button', { name: /^Publish/ })[0];
    expect(publish).toBeDisabled(); // nothing waiting
    await user.clear(headline);
    await user.type(headline, 'Glow every day');
    expect(screen.getByText('Glow every day', { selector: 'p' })).toBeInTheDocument(); // preview
    expect(screen.getAllByText(/Save the draft before publishing/).length).toBeGreaterThan(0);
    expect(contentApi.saveDraft).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() =>
      expect(contentApi.saveDraft).toHaveBeenCalledWith(
        'hero',
        expect.objectContaining({ headline: 'Glow every day' }),
      ),
    );
    expect(contentApi.publishBlock).not.toHaveBeenCalled();
  });

  it('publishes and discards a waiting draft', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.listBlocks).mockResolvedValue([
      { ...hero, has_draft: true, draft: { headline: 'Draft headline', subtitle: 'Sub' } },
      about,
      announcements,
      zenotians,
    ]);
    vi.mocked(contentApi.publishBlock).mockResolvedValue(hero);
    vi.mocked(contentApi.discardDraft).mockResolvedValue(hero);
    renderAt('/content');
    expect(await screen.findByDisplayValue('Draft headline')).toBeInTheDocument();
    expect(screen.getByText('Draft waiting')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Publish draft' })[0]);
    await waitFor(() => expect(contentApi.publishBlock).toHaveBeenCalledWith('hero'));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(contentApi.discardDraft).toHaveBeenCalledWith('hero'));
  });

  it('hides a published announcement banner from the public site', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.unpublishBlock).mockResolvedValue({
      ...announcements,
      is_published: false,
    });
    renderAt('/content');
    await user.click(await screen.findByRole('tab', { name: 'Announcements' }));
    expect(await screen.findByDisplayValue('Open on Diwali')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide from site' }));
    await waitFor(() => expect(contentApi.unpublishBlock).toHaveBeenCalledWith('announcements'));
  });

  it('offers a Zenotians page that is not published yet', async () => {
    const user = userEvent.setup();
    renderAt('/content');
    await user.click(await screen.findByRole('tab', { name: 'Zenotians page' }));
    expect(await screen.findByText('Not published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });

  it('edits the Zenotians page: the phone stays off and blank demo rows are not sent', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.listBlocks).mockResolvedValue([
      hero,
      about,
      announcements,
      { ...zenotians, is_published: true, published: fullContent },
    ]);
    vi.mocked(contentApi.saveDraft).mockResolvedValue({ ...zenotians, has_draft: true });
    renderAt('/content');
    await user.click(await screen.findByRole('tab', { name: 'Zenotians page' }));
    expect(await screen.findByText('Menu visitors will see')).toBeInTheDocument();
    expect(screen.queryByText('Try the demo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Resume' }));
    const phone = screen.getAllByRole('checkbox', { name: 'Show publicly' }).at(-1)!;
    expect(phone).not.toBeChecked();
    await user.click(screen.getByRole('tab', { name: 'Demo logins' }));
    await user.click(screen.getByRole('button', { name: /Add demo login/ }));
    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(contentApi.saveDraft).toHaveBeenCalled());
    const sent = vi.mocked(contentApi.saveDraft).mock.calls.at(-1)![1] as typeof fullContent;
    expect(sent.demo?.logins).toEqual([]);
    expect(sent.resume?.contacts?.find((c) => c.key === 'phone')?.public).toBe(false);
  });

  it('adds an FAQ as a draft and publishes it from the list', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.createFaq).mockResolvedValue({} as contentApi.Faq);
    vi.mocked(contentApi.updateFaq).mockResolvedValue({ is_active: true } as contentApi.Faq);
    renderAt('/content');
    await user.click(await screen.findByRole('tab', { name: 'FAQs' }));
    expect(await screen.findByText('Do you take walk-ins?')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(contentApi.updateFaq).toHaveBeenCalledWith(1, { is_active: true }));
    await user.click(screen.getByRole('button', { name: /Add a question/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a question' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Write both the question and the answer.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Question'), 'Parking?');
    await user.type(within(dialog).getByLabelText('Answer'), 'Yes, behind the shop.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(contentApi.createFaq).toHaveBeenCalledWith(
        expect.objectContaining({ question: 'Parking?', is_active: false }),
      ),
    );
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)('is closed to %s', async (role) => {
    setup(role);
    renderAt('/content');
    await waitFor(() => expect(screen.queryByText('Website content')).not.toBeInTheDocument());
    expect(contentApi.listBlocks).not.toHaveBeenCalled();
  });
});

describe('marketing', () => {
  beforeEach(() => setup());

  it('lists coupons with their rules and switches one off', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.updateCoupon).mockResolvedValue({ ...coupon, is_active: false });
    renderAt('/marketing');
    expect(await screen.findByText('WELCOME10')).toBeInTheDocument();
    expect(screen.getByText(/10% off · up to ₹200/)).toBeInTheDocument();
    expect(screen.getByText(/Used 3 of 100 · 1 per customer/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch off' }));
    await waitFor(() =>
      expect(marketingApi.updateCoupon).toHaveBeenCalledWith('c1', { is_active: false }),
    );
  });

  it('creates a coupon after checking the rules in the form', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.createCoupon).mockResolvedValue(coupon);
    renderAt('/marketing');
    await user.click(await screen.findByRole('button', { name: /New coupon/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New coupon' });
    await user.click(within(dialog).getByRole('button', { name: 'Save coupon' }));
    expect(await within(dialog).findByText(/The code needs 3 to 24/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Code'), 'DIWALI15');
    await user.type(within(dialog).getByLabelText('Name'), 'Diwali');
    await user.type(within(dialog).getByLabelText('Percent off'), '150');
    await user.click(within(dialog).getByRole('button', { name: 'Save coupon' }));
    expect(
      await within(dialog).findByText('A percentage cannot be more than 100.'),
    ).toBeInTheDocument();
    expect(marketingApi.createCoupon).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByLabelText('Percent off'));
    await user.type(within(dialog).getByLabelText('Percent off'), '15');
    await user.click(within(dialog).getByRole('checkbox', { name: /Can be combined/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save coupon' }));
    await waitFor(() =>
      expect(marketingApi.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DIWALI15',
          kind: 'percent',
          value: '15',
          stackable: true,
          per_customer_limit: 1,
          total_limit: null,
        }),
      ),
    );
  });

  it('saves the loyalty rules', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.saveLoyalty).mockResolvedValue({
      loyalty_points_per_100: 2,
      loyalty_point_value: 1,
      loyalty_max_redeem_percent: 50,
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Loyalty' }));
    const earn = await screen.findByLabelText('Points earned per ₹100 paid');
    await user.clear(earn);
    await user.type(earn, '2');
    await user.click(screen.getByRole('button', { name: 'Save loyalty rules' }));
    await waitFor(() =>
      expect(marketingApi.saveLoyalty).toHaveBeenCalledWith({
        loyalty_points_per_100: 2,
        loyalty_point_value: 1,
        loyalty_max_redeem_percent: 50,
      }),
    );
  });

  it('shows who a campaign would reach and sends it only after a confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.sendCampaign).mockResolvedValue({
      ...campaign,
      status: 'sent',
      recipients: 4,
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Campaigns' }));
    expect(await screen.findByText(/would reach 4/)).toBeInTheDocument();
    expect(screen.getByText(/4 customers can be reached now/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send this campaign?' });
    expect(within(dialog).getByText(/4 opted-in customers/)).toBeInTheDocument();
    expect(marketingApi.sendCampaign).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(marketingApi.sendCampaign).toHaveBeenCalledWith('k1'));
  });

  it('shows the server message when nobody can be reached', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.sendCampaign).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'No opted-in customers match this audience.' } },
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Campaigns' }));
    await user.click(await screen.findByRole('button', { name: 'Send…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send this campaign?' });
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    expect(
      await within(dialog).findByText('No opted-in customers match this audience.'),
    ).toBeInTheDocument();
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)('is closed to %s', async (role) => {
    setup(role);
    renderAt('/marketing');
    await waitFor(() => expect(screen.queryByText('Coupons')).not.toBeInTheDocument());
    expect(marketingApi.listCoupons).not.toHaveBeenCalled();
  });
});

describe('reports', () => {
  beforeEach(() => setup());

  it('shows the chart, the rows and a total that matches the report', async () => {
    renderAt('/reports');
    expect(await screen.findByText('chart: Revenue by day chart')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Revenue by day/ });
    expect(within(table).getByText('2026-10-01')).toBeInTheDocument();
    const total = within(table).getByText('Total').closest('tr') as HTMLElement;
    expect(within(total).getByText(/1,500/)).toBeInTheDocument();
    expect(within(total).getByText('3')).toBeInTheDocument();
  });

  it('asks again when the report or the dates change', async () => {
    const user = userEvent.setup();
    renderAt('/reports');
    await screen.findByRole('table', { name: /Revenue by day/ });
    await user.selectOptions(screen.getByLabelText('Report'), 'top-customers');
    await waitFor(() =>
      expect(reportsApi.getReport).toHaveBeenLastCalledWith('top-customers', expect.any(Object)),
    );
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => {
      const [, range] = vi.mocked(reportsApi.getReport).mock.calls.at(-1)!;
      const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
      expect(days).toBe(6);
    });
  });

  it('refuses a backwards range without asking the server', async () => {
    const user = userEvent.setup();
    renderAt('/reports');
    await screen.findByRole('table', { name: /Revenue by day/ });
    const calls = vi.mocked(reportsApi.getReport).mock.calls.length;
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2999-01-01');
    expect(await screen.findByText('The start date is after the end date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeDisabled();
    expect(vi.mocked(reportsApi.getReport).mock.calls.length).toBe(calls);
  });

  it('downloads the CSV for the chosen range', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.downloadReport).mockResolvedValue(new Blob(['a,b']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderAt('/reports');
    await screen.findByRole('table', { name: /Revenue by day/ });
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() =>
      expect(reportsApi.downloadReport).toHaveBeenCalledWith(
        'revenue-by-day',
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      ),
    );
  });

  it('says so when a range has nothing in it, and when the server fails', async () => {
    vi.mocked(reportsApi.getReport).mockResolvedValueOnce({ ...revenue, rows: [] });
    const first = renderAt('/reports');
    expect(await screen.findByText('Nothing in this range')).toBeInTheDocument();
    first.unmount();
    vi.mocked(reportsApi.getReport).mockRejectedValue(new Error('boom'));
    renderAt('/reports');
    expect(await screen.findByText("We couldn't load this report.")).toBeInTheDocument();
  });

  it.each(['receptionist', 'stylist', 'customer'] as const)('is closed to %s', async (role) => {
    setup(role);
    renderAt('/reports');
    await waitFor(() => expect(screen.queryByText('Download CSV')).not.toBeInTheDocument());
    expect(reportsApi.getReport).not.toHaveBeenCalled();
  });
});

describe('public site: announcements and unsubscribe', () => {
  beforeEach(() => setup());

  it('shows live announcements above the navigation and nothing when there are none', async () => {
    vi.mocked(publicApi.getSite).mockResolvedValue({
      ...site,
      announcements: [{ text: 'Closed on Sunday 2 Nov', link: '' }],
    });
    const first = renderAt('/');
    const bar = await screen.findByRole('complementary', { name: 'Announcements' });
    expect(within(bar).getByText('Closed on Sunday 2 Nov')).toBeInTheDocument();
    first.unmount();
    vi.mocked(publicApi.getSite).mockResolvedValue({ ...site, announcements: [] });
    renderAt('/');
    await screen.findByRole('link', { name: /Book/i });
    expect(screen.queryByRole('complementary', { name: 'Announcements' })).not.toBeInTheDocument();
  });

  it('unsubscribes only after the button is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.unsubscribe).mockResolvedValue({ detail: 'You are unsubscribed.' });
    renderAt('/unsubscribe?token=abc');
    expect(marketingApi.unsubscribe).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Unsubscribe me' }));
    expect(await screen.findByText('You are unsubscribed.')).toBeInTheDocument();
    expect(marketingApi.unsubscribe).toHaveBeenCalledWith('abc');
  });

  it('explains a link with no token', async () => {
    renderAt('/unsubscribe');
    expect(await screen.findByText(/This link is not complete/)).toBeInTheDocument();
  });
});

const priv: marketingApi.PrivateCoupon = {
  id: 'p1',
  code: 'VIP-AB12CD34',
  name: 'Thank you',
  description: 'Rs. 100 off.',
  kind: 'flat',
  value: '100.00',
  min_bill: '0.00',
  max_discount: null,
  applies_to: 'all',
  ends_on: '2026-12-31',
  state: 'ready',
  customer_id: 'c1',
  customer_name: 'Priya Nair',
  customer_email: 'priya@example.com',
  issued_at: '2026-10-27T10:00:00Z',
};

describe('private coupons', () => {
  beforeEach(() => setup());

  it('lists them with their owner and withdraws one', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.listPrivateCoupons).mockResolvedValue([priv]);
    vi.mocked(marketingApi.withdrawPrivateCoupon).mockResolvedValue({
      ...priv,
      state: 'withdrawn',
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Private coupons' }));
    expect(await screen.findByText('VIP-AB12CD34')).toBeInTheDocument();
    expect(screen.getByText(/Priya Nair \(priya@example.com\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(marketingApi.withdrawPrivateCoupon).toHaveBeenCalledWith('p1'));
  });

  it('issues a coupon to a customer found by search', async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.searchCustomers).mockResolvedValue({
      count: 1,
      results: [
        {
          id: 'c1',
          full_name: 'Priya Nair',
          email: 'priya@example.com',
          phone: '',
          has_allergies: false,
          email_verified: true,
          visits: 2,
        },
      ],
    });
    vi.mocked(marketingApi.issuePrivateCoupons).mockResolvedValue({
      issued: 1,
      emailed: 1,
      coupons: [priv],
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Private coupons' }));
    await user.click(await screen.findByRole('button', { name: 'Issue coupons' }));
    const dialog = await screen.findByRole('dialog', { name: 'Issue private coupons' });
    await user.type(within(dialog).getByLabelText('Coupon name'), 'Thank you');
    await user.type(within(dialog).getByLabelText('Amount off (₹)'), '100');
    await user.type(within(dialog).getByLabelText('Last day'), '2026-12-31');
    await user.type(within(dialog).getByLabelText('Find a customer'), 'priya');
    await user.click(within(dialog).getByRole('button', { name: 'Search' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Add' }));
    await user.click(within(dialog).getByRole('button', { name: 'Issue coupons' }));
    await waitFor(() =>
      expect(marketingApi.issuePrivateCoupons).toHaveBeenCalledWith(
        expect.objectContaining({ customers: ['c1'], value: '100', ends_on: '2026-12-31' }),
      ),
    );
  });

  it('shows the server message when issuing is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.issuePrivateCoupons).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { detail: 'Choose customers, or one group, not both.' } },
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Private coupons' }));
    await user.click(await screen.findByRole('button', { name: 'Issue coupons' }));
    const dialog = await screen.findByRole('dialog', { name: 'Issue private coupons' });
    await user.click(within(dialog).getByRole('button', { name: 'Issue coupons' }));
    expect(
      await within(dialog).findByText('Choose customers, or one group, not both.'),
    ).toBeInTheDocument();
  });
});

describe('scheduled campaigns', () => {
  beforeEach(() => setup());

  it('schedules a draft for a chosen time', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.scheduleCampaign).mockResolvedValue({
      ...campaign,
      status: 'scheduled',
    });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Campaigns' }));
    await user.click(await screen.findByRole('button', { name: 'Schedule…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule this campaign' });
    await user.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    expect(await within(dialog).findByText('Choose the day and time.')).toBeInTheDocument();
    expect(marketingApi.scheduleCampaign).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Send on'), '2030-01-01T10:30');
    await user.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    await waitFor(() =>
      expect(marketingApi.scheduleCampaign).toHaveBeenCalledWith('k1', expect.any(String)),
    );
  });

  it('shows a scheduled campaign and takes the schedule off', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.listCampaigns).mockResolvedValue({
      opted_in: 4,
      audiences: [{ value: 'all', label: 'All opted-in customers' }],
      results: [{ ...campaign, status: 'scheduled', scheduled_for: '2030-01-01T05:00:00Z' }],
    });
    vi.mocked(marketingApi.unscheduleCampaign).mockResolvedValue(campaign);
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Campaigns' }));
    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove schedule' }));
    await waitFor(() => expect(marketingApi.unscheduleCampaign).toHaveBeenCalledWith('k1'));
  });

  it('sends whatever is due with one button', async () => {
    const user = userEvent.setup();
    vi.mocked(marketingApi.runDueCampaigns).mockResolvedValue({ sent: 2 });
    renderAt('/marketing');
    await user.click(await screen.findByRole('tab', { name: 'Campaigns' }));
    await user.click(await screen.findByRole('button', { name: 'Send due now' }));
    await waitFor(() => expect(marketingApi.runDueCampaigns).toHaveBeenCalled());
    expect(await screen.findByText('2 campaign(s) sent')).toBeInTheDocument();
  });
});

describe('heatmap report', () => {
  beforeEach(() => setup());

  it('draws weekday by hour with the numbers in the cells', async () => {
    const user = userEvent.setup();
    const heat: reportsApi.Report = {
      key: 'peak-hours-visits',
      label: 'Busiest hours: visits',
      from: '2026-10-01',
      to: '2026-10-02',
      columns: [
        { key: 'weekday', label: 'Day', kind: 'text' },
        { key: 'h10', label: '10:00', kind: 'number' },
        { key: 'total', label: 'Total', kind: 'number' },
      ],
      rows: [
        { weekday: 'Monday', h10: 3, total: 3 },
        { weekday: 'Tuesday', h10: 0, total: 0 },
      ],
      totals: { weekday: 'Total', h10: 3, total: 3 },
      chart: { kind: 'heatmap', x: 'weekday', hours: ['h10'] },
      summary: { busiest: 'Monday 10:00' },
    };
    vi.mocked(reportsApi.listReports).mockResolvedValue([
      { key: 'revenue-by-day', label: 'Revenue by day' },
      { key: 'peak-hours-visits', label: 'Busiest hours: visits' },
    ]);
    vi.mocked(reportsApi.getReport).mockImplementation(async (name) =>
      name === 'peak-hours-visits' ? heat : revenue,
    );
    renderAt('/reports');
    await screen.findByRole('option', { name: 'Busiest hours: visits' });
    await user.selectOptions(screen.getByLabelText('Report'), 'peak-hours-visits');
    const grid = await screen.findByRole('table', { name: /busiest days and hours/ });
    expect(within(grid).getByRole('rowheader', { name: 'Monday' })).toBeInTheDocument();
    expect(within(grid).getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/busiest: Monday 10:00/)).toBeInTheDocument();
  });
});
