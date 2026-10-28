import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  getStylistRatings,
  listRatingSummaries,
  moderateRating,
  type AdminRating,
  type Moderation,
  type ModerationAction,
  type StylistRatingSummary,
} from '../../api/ratingsAdmin';
import { ReasonModal } from '../../components/admin/wallet/ReasonModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  useToast,
  type BadgeTone,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const BarChartView = lazy(() => import('../../components/charts/BarChartView'));

const DIRECTION: Record<StylistRatingSummary['direction'], { label: string; tone: BadgeTone }> = {
  up: { label: 'Trending up', tone: 'success' },
  down: { label: 'Trending down', tone: 'warning' },
  steady: { label: 'Steady', tone: 'neutral' },
  new: { label: 'Not enough months yet', tone: 'neutral' },
};
const MODERATION_TONE: Record<Moderation, BadgeTone> = {
  active: 'success',
  under_review: 'warning',
  excluded: 'danger',
};
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Counting' },
  { value: 'under_review', label: 'Under review' },
  { value: 'excluded', label: 'Excluded' },
];
const ACTION_TEXT: Record<ModerationAction, { title: string; text: string; button: string }> = {
  flag: {
    title: 'Put under review',
    text: 'It stops counting in the stylist’s average, graphs and pay until you decide. The stylist only sees that a rating is under review: no customer, comment or reason.',
    button: 'Put under review',
  },
  exclude: {
    title: 'Exclude this rating',
    text: 'It will not count in the average, graphs or pay. The rating is never deleted: the original stars stay on record and in the audit log.',
    button: 'Exclude',
  },
  restore: {
    title: 'Count this rating again',
    text: 'It returns to the stylist’s average, graphs and pay.',
    button: 'Restore',
  },
};

/** Admin: each stylist's average, count and trend, with comments and moderation. */
export default function RatingsPage() {
  useDocumentTitle('Ratings');
  const [open, setOpen] = useState<string>('');
  const summaries = useQuery({ queryKey: ['a-ratings'], queryFn: listRatingSummaries });
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Ratings"
        description="Customers rate their stylist after every paid visit. Ratings are never edited or deleted; you can put an unfair one under review or exclude it, with a reason, and it stops counting."
      />
      {summaries.isPending ? (
        <LoadingState label="Loading ratings…" />
      ) : summaries.isError ? (
        <ErrorState
          description="We couldn't load the ratings."
          onRetry={() => void summaries.refetch()}
        />
      ) : summaries.data.length === 0 ? (
        <EmptyState
          title="No stylists yet"
          description="Stylists appear here once their account is linked to a team profile."
        />
      ) : (
        <ul className="grid gap-md md:grid-cols-2" aria-label="Stylists">
          {summaries.data.map((s) => (
            <li key={s.id}>
              <SummaryCard
                row={s}
                selected={open === s.id}
                onToggle={() => setOpen(open === s.id ? '' : s.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {open && <StylistRatings id={open} />}
    </div>
  );
}

function SummaryCard({
  row,
  selected,
  onToggle,
}: {
  row: StylistRatingSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  const direction = DIRECTION[row.direction];
  return (
    <Card variant="dense" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-xs">
        <h2 className="text-lg font-semibold text-text">{row.name}</h2>
        {!row.active && <Badge>Deactivated</Badge>}
        <Badge tone={direction.tone}>{direction.label}</Badge>
        {row.needs_attention && <Badge tone="danger">Needs attention</Badge>}
      </div>
      <p className="text-2xl font-semibold text-text">
        {row.average ?? 'No ratings'}
        {row.average && <span className="text-sm font-normal text-text-muted"> of 5</span>}
      </p>
      <p className="text-sm text-text-muted">
        {row.count} counting
        {row.under_review > 0 && ` · ${row.under_review} under review`}
        {row.excluded > 0 && ` · ${row.excluded} excluded`}
      </p>
      <div>
        <Button
          type="button"
          size="sm"
          variant={selected ? 'secondary' : 'primary'}
          aria-expanded={selected}
          onClick={onToggle}
        >
          {selected ? 'Hide comments' : `Comments for ${row.name}`}
        </Button>
      </div>
    </Card>
  );
}

function StylistRatings({ id }: { id: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const detail = useQuery({
    queryKey: ['a-ratings', id, filter],
    queryFn: () => getStylistRatings(id, filter),
  });
  const [acting, setActing] = useState<{ rating: AdminRating; action: ModerationAction } | null>(
    null,
  );
  const [problem, setProblem] = useState('');
  const act = useMutation({
    mutationFn: (v: { id: string; action: ModerationAction; reason: string }) =>
      moderateRating(v.id, v.action, v.reason),
    onSuccess: () => {
      setActing(null);
      void queryClient.invalidateQueries({ queryKey: ['a-ratings'] });
      toast.show({ tone: 'success', title: 'Saved. The change is in the audit log.' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not save.'),
  });
  if (detail.isPending) return <LoadingState label="Loading comments…" />;
  if (detail.isError) {
    return (
      <ErrorState
        description="We couldn't load this stylist's ratings."
        onRetry={() => void detail.refetch()}
      />
    );
  }
  const d = detail.data;
  const chart = d.trend.map((t) => ({ label: t.month, value: Number(t.average) }));
  return (
    <Card as="section" aria-label={`Ratings for ${d.name}`} className="flex flex-col gap-md">
      <h2 className="text-lg font-semibold text-text">{d.name}</h2>
      <div className="grid gap-md md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Spread of stars (counting ratings)</h3>
          <ul className="mt-xs text-sm text-text">
            {[5, 4, 3, 2, 1].map((n) => (
              <li key={n} className="flex justify-between gap-md">
                <span>{n} stars</span>
                <span>{d.distribution[String(n)] ?? 0}</span>
              </li>
            ))}
          </ul>
          {d.pending > 0 && (
            <p className="mt-sm text-xs text-text-muted">
              {d.pending} visit{d.pending === 1 ? '' : 's'} not rated yet. They are never guessed.
            </p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">Average by month</h3>
          {chart.length === 0 ? (
            <p className="mt-xs text-sm text-text-muted">No counting ratings yet.</p>
          ) : (
            <Suspense fallback={<LoadingState label="Loading the graph…" />}>
              <BarChartView
                data={chart}
                title={`Average rating by month for ${d.name}`}
                valueLabel="Average stars"
              />
            </Suspense>
          )}
        </div>
      </div>
      <FilterChips
        label="Filter ratings"
        options={FILTERS}
        value={filter}
        onChange={(v) => setFilter(v)}
      />
      {d.ratings.length === 0 ? (
        <EmptyState title="No ratings here" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-sm">
          {d.ratings.map((r) => (
            <li key={r.id} className="rounded-nested border border-border p-md">
              <div className="flex flex-wrap items-center gap-xs">
                <p className="font-semibold text-text">{r.stars} of 5</p>
                <Badge tone={MODERATION_TONE[r.moderation]}>{r.moderation_label}</Badge>
                <span className="text-sm text-text-muted">
                  {r.customer} · {r.service} · {formatDateTime(r.date)}
                </span>
              </div>
              {r.comment && <p className="mt-xs text-sm text-text">{r.comment}</p>}
              {r.tags.length > 0 && <p className="text-xs text-text-muted">{r.tags.join(', ')}</p>}
              {r.moderation !== 'active' && (
                <p className="mt-xs text-xs text-text-muted">
                  {r.moderated_by ? `${r.moderated_by}: ` : ''}
                  {r.reason}
                </p>
              )}
              <div className="mt-sm flex flex-wrap gap-sm">
                {r.moderation === 'active' && (
                  <Button size="sm" variant="secondary" onClick={() => start(r, 'flag')}>
                    Put under review
                  </Button>
                )}
                {r.moderation !== 'excluded' && (
                  <Button size="sm" variant="ghost" onClick={() => start(r, 'exclude')}>
                    Exclude
                  </Button>
                )}
                {r.moderation !== 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => start(r, 'restore')}>
                    Count again
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {acting && (
        <ReasonModal
          title={ACTION_TEXT[acting.action].title}
          description={ACTION_TEXT[acting.action].text}
          confirmLabel={ACTION_TEXT[acting.action].button}
          busy={act.isPending}
          problem={problem}
          onClose={() => setActing(null)}
          onConfirm={(reason) =>
            act.mutate({ id: acting.rating.id, action: acting.action, reason })
          }
        />
      )}
    </Card>
  );

  function start(rating: AdminRating, action: ModerationAction) {
    setProblem('');
    setActing({ rating, action });
  }
}
