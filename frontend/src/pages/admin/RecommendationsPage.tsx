import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getAdminRecommendations,
  rebuildRecommendations,
  saveAdminRecommendations,
  type AdminRecommendations,
  type Evaluation,
} from '../../api/recommendations';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  Checkbox,
  ErrorState,
  LoadingState,
  Select,
  Table,
  type Column,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const KEY = ['admin-recommendations'] as const;

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`;

type MetricRow = AdminRecommendations['metrics'][number];

/** Admin: what recommendations did (shown, clicked, booked), the offline evaluation against the
 * popularity baseline, and the switches (on/off, rebook reminders, excluded services, pinned
 * offer, rebuild). */
export default function RecommendationsPage() {
  useDocumentTitle('Recommendations');
  const query = useQuery({ queryKey: KEY, queryFn: getAdminRecommendations });
  const client = useQueryClient();
  const toast = useToast();
  const onSaved = (data: AdminRecommendations) => {
    client.setQueryData(KEY, data);
    toast.show({ tone: 'success', title: 'Saved' });
  };
  const save = useMutation({
    mutationFn: (body: Parameters<typeof saveAdminRecommendations>[0]) =>
      saveAdminRecommendations(body),
    onSuccess: onSaved,
    onError: () => toast.show({ tone: 'danger', title: 'Could not save.' }),
  });
  const rebuild = useMutation({
    mutationFn: () => rebuildRecommendations(),
    onSuccess: (data) => {
      client.setQueryData(KEY, data);
      toast.show({ tone: 'success', title: 'Rebuilt from the latest visits' });
    },
    onError: () => toast.show({ tone: 'danger', title: 'Could not rebuild.' }),
  });

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Recommendations"
        description="Personal suggestions are counting rules over booking history, never gender, age, caste or religion. Here you see what they did and control them."
        actions={
          <Button
            type="button"
            variant="secondary"
            loading={rebuild.isPending}
            onClick={() => rebuild.mutate()}
          >
            Rebuild now
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingState label="Loading recommendation results…" />
      ) : query.isError ? (
        <ErrorState
          description="We couldn't load the recommendation results."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <Body data={query.data} save={(body) => save.mutate(body)} saving={save.isPending} />
      )}
    </div>
  );
}

function Body({
  data,
  save,
  saving,
}: {
  data: AdminRecommendations;
  save: (body: Partial<AdminRecommendations['settings']>) => void;
  saving: boolean;
}) {
  const [exclude, setExclude] = useState('');
  const columns: Column<MetricRow>[] = [
    { key: 'label', header: 'Where', render: (r) => r.label },
    { key: 'impressions', header: 'Shown', render: (r) => r.impressions },
    { key: 'clicks', header: 'Clicked', render: (r) => r.clicks },
    { key: 'click_rate', header: 'Click rate', render: (r) => pct(r.click_rate) },
    {
      key: 'bookings',
      header: `Booked within ${data.booked_within_days} days`,
      render: (r) => r.bookings,
    },
    { key: 'conversion', header: 'Conversion', render: (r) => pct(r.conversion) },
    { key: 'dismissed', header: 'Not interested', render: (r) => r.dismissed },
  ];
  const excluded = data.services.filter((s) => data.settings.excluded_services.includes(s.id));
  const available = data.services.filter((s) => !data.settings.excluded_services.includes(s.id));
  return (
    <>
      <Card variant="dense" as="section" aria-labelledby="rec-results" padding="lg">
        <h2 id="rec-results" className="text-lg font-semibold">
          Results, last {data.window_days} days
        </h2>
        <p className="mt-xs text-sm text-text-muted">
          Counted inside the app (no tracking pixels). A booking counts when the customer sent a
          request for the clicked service within {data.booked_within_days} days.{' '}
          {data.customers_off} customer{data.customers_off === 1 ? '' : 's'} switched suggestions
          off.
        </p>
        <div className="mt-md">
          <Table
            caption="Recommendation results by placement"
            columns={columns}
            rows={data.metrics}
            rowKey={(r) => r.placement}
          />
        </div>
      </Card>

      <EvaluationCard evaluation={data.evaluation} data={data} />

      <Card variant="dense" as="section" aria-labelledby="rec-controls" padding="lg">
        <h2 id="rec-controls" className="text-lg font-semibold">
          Controls
        </h2>
        <div className="mt-md flex flex-col gap-md">
          <Checkbox
            name="rec-enabled"
            checked={data.settings.enabled}
            disabled={saving}
            onChange={(e) => save({ enabled: e.target.checked })}
            label="Show personal recommendations to customers"
          />
          <Checkbox
            name="rec-rebook"
            checked={data.settings.rebook_reminders}
            disabled={saving}
            onChange={(e) => save({ rebook_reminders: e.target.checked })}
            label="Send rebook reminders (once per visit cycle)"
          />
          <div className="grid gap-md sm:grid-cols-2">
            <div className="flex flex-col gap-sm">
              <Select
                label="Never recommend this service"
                value={exclude}
                placeholder="Choose a service"
                onChange={(e) => setExclude(e.target.value)}
                options={available.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.category})`,
                }))}
              />
              <div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!exclude || saving}
                  onClick={() => {
                    save({ excluded_services: [...data.settings.excluded_services, exclude] });
                    setExclude('');
                  }}
                >
                  Exclude
                </Button>
              </div>
              {excluded.length > 0 && (
                <ul className="flex flex-wrap gap-sm" aria-label="Excluded services">
                  {excluded.map((s) => (
                    <li key={s.id}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Recommend ${s.name} again`}
                        onClick={() =>
                          save({
                            excluded_services: data.settings.excluded_services.filter(
                              (id) => id !== s.id,
                            ),
                          })
                        }
                      >
                        {s.name} · Allow again
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Select
              label="Pinned offer (shown above the suggestions)"
              value={data.settings.pinned_offer ? String(data.settings.pinned_offer) : ''}
              placeholder="No pinned offer"
              onChange={(e) =>
                save({ pinned_offer: e.target.value ? Number(e.target.value) : null })
              }
              options={data.offers.map((o) => ({ value: String(o.id), label: o.title }))}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

function EvaluationCard({
  evaluation,
  data,
}: {
  evaluation: Evaluation;
  data: AdminRecommendations;
}) {
  const measured = evaluation.customers !== undefined && evaluation.hit_rate !== undefined;
  return (
    <Card variant="dense" as="section" aria-labelledby="rec-eval" padding="lg">
      <h2 id="rec-eval" className="text-lg font-semibold">
        Offline evaluation
      </h2>
      <p className="mt-xs text-sm text-text-muted">
        {data.built_at
          ? `Built ${formatDateTime(data.built_at)} from ${data.visits_used} completed visits (${data.pairs} service pairs).`
          : 'Not built yet. Press Rebuild now.'}{' '}
        Time split: the model learns only from visits before the cutoff and suggests 5 services to
        each customer who booked something new after it, compared with the 5 most booked services
        (popularity).
      </p>
      {measured ? (
        <dl className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Hit rate at 5" value={pct(evaluation.hit_rate)} />
          <Stat label="Popularity hit rate" value={pct(evaluation.baseline_hit_rate)} />
          <Stat label="Precision at 5" value={(evaluation.precision ?? 0).toFixed(3)} />
          <Stat
            label="Popularity precision"
            value={(evaluation.baseline_precision ?? 0).toFixed(3)}
          />
        </dl>
      ) : null}
      {evaluation.cutoff && (
        <p className="mt-sm text-sm text-text">
          Cutoff {evaluation.cutoff}: {evaluation.train_visits} visits to learn from,{' '}
          {evaluation.test_visits} after, {evaluation.customers} customers measured.
        </p>
      )}
      {evaluation.note && <p className="mt-sm text-sm text-text-muted">{evaluation.note}</p>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-nested border border-border p-md">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="tabular text-2xl font-semibold text-text">{value}</dd>
    </div>
  );
}
