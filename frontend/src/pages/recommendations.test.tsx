import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as recApi from '../api/recommendations';
import { AddAfter } from '../components/recommendations/AddAfter';
import { ForYou } from '../components/recommendations/ForYou';
import { RecommendationsCard } from '../components/recommendations/RecommendationsCard';
import { ToastProvider } from '../components/ui';
import { routerFuture } from '../config/router';
import { canAccess, canCall } from '../policy/policy';
import RecommendationsPage from './admin/RecommendationsPage';

vi.mock('../api/recommendations', () => ({
  getMyRecommendations: vi.fn(),
  getRecPrefs: vi.fn(),
  saveRecPrefs: vi.fn(),
  recFeedback: vi.fn(),
  getAddon: vi.fn(),
  getAdminRecommendations: vi.fn(),
  saveAdminRecommendations: vi.fn(),
  rebuildRecommendations: vi.fn(),
}));

const service = (name: string, slug: string): recApi.RecService => ({
  id: `id-${slug}`,
  name,
  slug,
  category: 'Nails',
  division: 'beauty-parlor',
  duration_minutes: 30,
  from_price: '500.00',
});

const mine: recApi.MyRecommendations = {
  available: true,
  enabled: true,
  notice_seen: false,
  rate_first: { rating_id: 'r1', service: 'Hair Spa', stylist: 'Rahul' },
  pinned_offer: { id: 1, title: 'Monsoon glow', description: '10% off facials.' },
  for_you: [
    {
      service: service('Pedicure', 'pedicure'),
      reasons: ['Often booked together with Manicure', 'Rated 4.6 out of 5 by 12 guests'],
      score: 0.6,
    },
  ],
  rebook: [
    {
      service: service('Haircut', 'haircut'),
      reason:
        'You usually come back for Haircut about every 30 days; your last visit was 33 days ago.',
      last_visit: '2026-10-10',
      slots: ['2026-11-15T11:00:00+05:30'],
      stylist: { id: 'st1', name: 'Asha' },
    },
  ],
  aftercare: {
    after: 'Hair Spa',
    products: [
      { id: 'p1', name: 'Argan serum', price: '650.00', reason: 'Often bought with Hair Spa' },
    ],
  },
  quiet_times: [{ weekday: 1, hour: 11, label: 'Tuesday around 11 AM', visits: 0, weeks: 8 }],
};

function show(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter future={routerFuture}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recApi.recFeedback).mockResolvedValue(undefined);
});

describe('For you on the customer dashboard', () => {
  it('shows the one-time notice, rate-first card, reasons, real rebook times and quiet times', async () => {
    vi.mocked(recApi.getMyRecommendations).mockResolvedValue(mine);
    show(<ForYou />);
    const notice = await screen.findByRole('note', { name: 'About your suggestions' });
    expect(notice).toHaveTextContent('never use your gender, age, religion');
    const cards = screen.getAllByText(/Rate your last visit|Monsoon glow|Time to rebook|Pedicure/);
    expect(cards[0]).toHaveTextContent('Rate your last visit'); // rating comes first
    expect(screen.getByRole('link', { name: 'Rate now' })).toHaveAttribute(
      'href',
      '#rate-your-visit',
    );
    expect(screen.getByText('Often booked together with Manicure')).toBeInTheDocument();
    const slot = within(screen.getByLabelText('Free times for Haircut')).getByRole('link');
    expect(slot.getAttribute('href')).toBe(
      '/customer/book?service=haircut&start=2026-11-15T11%3A00%3A00%2B05%3A30&stylist=st1',
    );
    expect(slot).toHaveTextContent('Asha');
    expect(screen.getByText('Tuesday around 11 AM')).toBeInTheDocument();
    expect(screen.getByText(/Aftercare for your Hair Spa/)).toBeInTheDocument();
  });

  it('records a click, a "not interested" and the notice choice', async () => {
    const user = userEvent.setup();
    vi.mocked(recApi.getMyRecommendations).mockResolvedValue(mine);
    vi.mocked(recApi.saveRecPrefs).mockResolvedValue({} as recApi.RecPrefs);
    show(<ForYou />);
    await user.click(await screen.findByRole('button', { name: 'Not interested in Pedicure' }));
    await waitFor(() =>
      expect(recApi.recFeedback).toHaveBeenCalledWith({
        action: 'not_interested',
        placement: 'dashboard',
        service: 'id-pedicure',
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Book Pedicure' }));
    expect(recApi.recFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'click', placement: 'dashboard', service: 'id-pedicure' }),
    );
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(recApi.saveRecPrefs).toHaveBeenCalledWith({ notice_seen: true, enabled: false }),
    );
  });

  it('shows nothing personal when switched off, and nothing at all when the shop turned it off', async () => {
    vi.mocked(recApi.getMyRecommendations).mockResolvedValue({
      ...mine,
      enabled: false,
      notice_seen: true,
      for_you: [],
      rebook: [],
      aftercare: null,
    });
    const { unmount } = show(<ForYou />);
    expect(await screen.findByText(/Personal suggestions are off/)).toBeInTheDocument();
    expect(screen.queryByText('Pedicure')).not.toBeInTheDocument();
    expect(screen.queryByText('Monsoon glow')).not.toBeInTheDocument();
    unmount();
    vi.mocked(recApi.getMyRecommendations).mockResolvedValue({ ...mine, available: false });
    const { container } = show(<ForYou />);
    await waitFor(() => expect(recApi.getMyRecommendations).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector('[data-for-you]')).toBeNull());
  });

  it('has an error state with a retry', async () => {
    vi.mocked(recApi.getMyRecommendations).mockRejectedValue(new Error('down'));
    show(<ForYou />);
    expect(await screen.findByText("We couldn't load your suggestions.")).toBeInTheDocument();
  });
});

describe('Profile: personal suggestions', () => {
  it('switches off, chooses interests and undoes "not interested"', async () => {
    const user = userEvent.setup();
    const prefs: recApi.RecPrefs = {
      enabled: true,
      notice_seen: true,
      interests: [],
      categories: [
        { id: 'c1', name: 'Nails', division: 'beauty-parlor' },
        { id: 'c2', name: 'Massages', division: 'spa' },
      ],
      not_interested: [{ id: 's9', name: 'Waxing' }],
    };
    vi.mocked(recApi.getRecPrefs).mockResolvedValue(prefs);
    vi.mocked(recApi.saveRecPrefs).mockResolvedValue(prefs);
    show(<RecommendationsCard />);
    await user.click(await screen.findByRole('checkbox', { name: 'Massages' }));
    expect(recApi.saveRecPrefs).toHaveBeenCalledWith({ interests: ['c2'] });
    await user.click(screen.getByRole('checkbox', { name: /Suggest services, rebook times/ }));
    expect(recApi.saveRecPrefs).toHaveBeenCalledWith({ enabled: false, notice_seen: true });
    await user.click(screen.getByRole('button', { name: 'Suggest Waxing again' }));
    expect(recApi.recFeedback).toHaveBeenCalledWith({ action: 'undo', service: 's9' });
  });
});

describe('Booking: add after', () => {
  it('appears only when the server found the same stylist free right after', async () => {
    vi.mocked(recApi.getAddon).mockResolvedValue(null);
    const { unmount } = show(
      <AddAfter service="manicure" stylist="st1" start="2026-11-15T11:00:00+05:30" />,
    );
    await waitFor(() => expect(recApi.getAddon).toHaveBeenCalled());
    expect(screen.queryByText(/right after/)).not.toBeInTheDocument();
    unmount();
    vi.mocked(recApi.getAddon).mockResolvedValue({
      service: service('Pedicure', 'pedicure'),
      start: '2026-11-15T11:30:00+05:30',
      stylist: { id: 'st1', name: 'Meena' },
      reason: 'Often booked together with Manicure',
    });
    show(<AddAfter service="manicure" stylist="st1" start="2026-11-15T11:00:00+05:30" />);
    expect(await screen.findByText(/Add Pedicure right after\? Meena is free/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Pedicure in a new tab' }).getAttribute('href'),
    ).toContain('service=pedicure&start=2026-11-15T11%3A30%3A00%2B05%3A30&stylist=st1');
  });
});

describe('Admin: recommendations page', () => {
  const admin: recApi.AdminRecommendations = {
    settings: { enabled: true, rebook_reminders: true, excluded_services: [], pinned_offer: null },
    services: [{ id: 's1', name: 'Pedicure', category: 'Nails' }],
    offers: [{ id: 3, title: 'Monsoon glow' }],
    built_at: '2026-11-12T10:00:00Z',
    visits_used: 1348,
    pairs: 380,
    quiet_times: [],
    evaluation: {
      status: 'ok',
      cutoff: '2026-08-22',
      train_visits: 1011,
      test_visits: 337,
      customers: 16,
      k: 5,
      hit_rate: 1,
      precision: 0.2,
      baseline_hit_rate: 0,
      baseline_precision: 0,
      note: 'On the demo database these are fictional customers.',
    },
    window_days: 30,
    booked_within_days: 7,
    metrics: [
      {
        placement: 'dashboard',
        label: 'Dashboard: For you',
        impressions: 40,
        clicks: 4,
        dismissed: 1,
        bookings: 2,
        click_rate: 0.1,
        conversion: 0.5,
      },
    ],
    customers_off: 2,
  };

  it('shows results, the evaluation against popularity, and changes the controls', async () => {
    const user = userEvent.setup();
    vi.mocked(recApi.getAdminRecommendations).mockResolvedValue(admin);
    vi.mocked(recApi.saveAdminRecommendations).mockResolvedValue(admin);
    vi.mocked(recApi.rebuildRecommendations).mockResolvedValue(admin);
    show(<RecommendationsPage />);
    const table = await screen.findByRole('table', { name: 'Recommendation results by placement' });
    expect(within(table).getByText('Dashboard: For you')).toBeInTheDocument();
    expect(within(table).getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Hit rate at 5').nextSibling).toHaveTextContent('100%');
    expect(screen.getByText('Popularity hit rate').nextSibling).toHaveTextContent('0%');
    expect(screen.getByText(/fictional customers/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Never recommend this service'), 's1');
    await user.click(screen.getByRole('button', { name: 'Exclude' }));
    expect(recApi.saveAdminRecommendations).toHaveBeenCalledWith({ excluded_services: ['s1'] });
    await user.selectOptions(screen.getByLabelText(/Pinned offer/), '3');
    expect(recApi.saveAdminRecommendations).toHaveBeenCalledWith({ pinned_offer: 3 });
    await user.click(screen.getByRole('button', { name: 'Rebuild now' }));
    await waitFor(() => expect(recApi.rebuildRecommendations).toHaveBeenCalled());
  });
});

describe('policy', () => {
  it('lets only the admin open the page and only customers read their own suggestions', () => {
    expect(canAccess('admin', '/recommendations')).toBe(true);
    for (const role of ['customer', 'receptionist', 'stylist'] as const) {
      expect(canAccess(role, '/recommendations')).toBe(false);
      expect(canCall(role, 'admin.recommendations.read')).toBe(false);
      expect(canCall(role, 'admin.recommendations.manage')).toBe(false);
    }
    expect(canCall('customer', 'my.recommendations.read')).toBe(true);
    for (const role of ['receptionist', 'stylist', 'admin'] as const) {
      expect(canCall(role, 'my.recommendations.read')).toBe(false);
    }
  });
});
