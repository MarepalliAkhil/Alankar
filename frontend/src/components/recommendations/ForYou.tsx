import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getMyRecommendations,
  recFeedback,
  saveRecPrefs,
  type MyRecommendations,
  type Placement,
} from '../../api/recommendations';
import { formatDateTime, formatINR } from '../../lib/format';
import { Button, ButtonLink, Card, ErrorState, LoadingState, useToast } from '../ui';
import { buttonClasses } from '../ui/button-styles';

export const MY_RECOMMENDATIONS_KEY = ['my-recommendations'] as const;

function bookPath(slug: string, start?: string, stylist?: string): string {
  const params = new URLSearchParams({ service: slug });
  if (start) params.set('start', start);
  if (stylist) params.set('stylist', stylist);
  return `/customer/book?${params.toString()}`;
}

function click(placement: Placement, service?: string, product?: string) {
  void recFeedback({ action: 'click', placement, service, product }).catch(() => undefined);
}

/**
 * The dashboard's "For you" block: a one-time notice, "rate your last visit" first, services
 * that are due again (with real free times), suggestions with their reasons, aftercare products
 * and quieter times. Every suggestion says why it is there and can be dismissed.
 */
export function ForYou() {
  const query = useQuery({ queryKey: MY_RECOMMENDATIONS_KEY, queryFn: getMyRecommendations });
  const client = useQueryClient();
  const toast = useToast();
  const refresh = () => void client.invalidateQueries({ queryKey: MY_RECOMMENDATIONS_KEY });
  const prefs = useMutation({
    mutationFn: (body: Parameters<typeof saveRecPrefs>[0]) => saveRecPrefs(body),
    onSuccess: refresh,
    onError: () =>
      toast.show({ title: 'We could not save that. Please try again.', tone: 'danger' }),
  });
  const dismiss = useMutation({
    mutationFn: (service: string) =>
      recFeedback({ action: 'not_interested', placement: 'dashboard', service }),
    onSuccess: () => {
      toast.show({ title: 'Got it. We will not suggest that again.', tone: 'success' });
      refresh();
    },
  });

  if (query.isPending) return <LoadingState label="Loading your suggestions…" />;
  if (query.isError)
    return (
      <ErrorState
        description="We couldn't load your suggestions."
        onRetry={() => void query.refetch()}
      />
    );
  const data: MyRecommendations = query.data;
  if (!data.available) return null;

  return (
    <section aria-labelledby="for-you" className="flex flex-col gap-md" data-for-you>
      <h2 id="for-you" className="text-lg font-semibold">
        For you
      </h2>

      {!data.notice_seen && data.enabled && (
        <Card
          padding="lg"
          className="flex flex-col gap-sm"
          role="note"
          aria-label="About your suggestions"
        >
          <p className="font-semibold text-text">Suggestions picked from your visits</p>
          <p className="text-sm text-text-muted">
            We suggest services from what you booked, what other guests often book together, what is
            popular and well rated, and the interests you choose. We never use your gender, age,
            religion or any other personal detail, and nothing leaves the shop. You can turn this
            off at any time here or on your profile.
          </p>
          <div className="flex flex-wrap gap-sm">
            <Button size="sm" onClick={() => prefs.mutate({ notice_seen: true })}>
              Keep them
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => prefs.mutate({ notice_seen: true, enabled: false })}
            >
              Turn off
            </Button>
          </div>
        </Card>
      )}

      {data.rate_first && (
        <Card
          padding="lg"
          className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold text-text">Rate your last visit</p>
            <p className="text-sm text-text-muted">
              {data.rate_first.service}
              {data.rate_first.stylist ? ` with ${data.rate_first.stylist}` : ''}. Your rating comes
              first; new requests wait until it is done.
            </p>
          </div>
          <a href="#rate-your-visit" className={buttonClasses('primary', 'sm', false)}>
            Rate now
          </a>
        </Card>
      )}

      {!data.enabled ? (
        <Card
          padding="lg"
          className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-text-muted">
            Personal suggestions are off. Nothing is picked from your visits.
          </p>
          <Button size="sm" variant="secondary" onClick={() => prefs.mutate({ enabled: true })}>
            Turn suggestions on
          </Button>
        </Card>
      ) : (
        <>
          {data.pinned_offer && (
            <Card padding="lg" aria-label="Offer">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-hover">
                Offer
              </p>
              <p className="font-semibold text-text">{data.pinned_offer.title}</p>
              <p className="text-sm text-text-muted">{data.pinned_offer.description}</p>
            </Card>
          )}

          {data.rebook.length > 0 && (
            <Card padding="lg" as="section" aria-labelledby="rebook">
              <h3 id="rebook" className="mb-sm font-semibold">
                Time to rebook
              </h3>
              <ul className="flex flex-col gap-md">
                {data.rebook.map((item) => (
                  <li key={item.service.id} className="flex flex-col gap-xs">
                    <p className="font-medium text-text">{item.service.name}</p>
                    <p className="text-sm text-text-muted">{item.reason}</p>
                    {item.slots.length > 0 ? (
                      <div
                        className="flex flex-wrap gap-sm"
                        aria-label={`Free times for ${item.service.name}`}
                      >
                        {item.slots.map((slot) => (
                          <ButtonLink
                            key={slot}
                            size="sm"
                            variant="secondary"
                            to={bookPath(item.service.slug, slot, item.stylist?.id)}
                            onClick={() => click('rebook', item.service.id)}
                          >
                            {formatDateTime(slot)}
                            {item.stylist ? ` · ${item.stylist.name}` : ''}
                          </ButtonLink>
                        ))}
                      </div>
                    ) : (
                      <ButtonLink
                        size="sm"
                        to={bookPath(item.service.slug)}
                        onClick={() => click('rebook', item.service.id)}
                      >
                        Pick a time
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.for_you.length > 0 ? (
            <ul
              className="grid gap-sm sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Suggested services"
            >
              {data.for_you.map((item) => (
                <li key={item.service.id}>
                  <Card padding="lg" className="flex h-full flex-col gap-sm">
                    <p className="font-semibold text-text">{item.service.name}</p>
                    <p className="text-xs text-text-muted">
                      {item.service.category} · from {formatINR(item.service.from_price)}
                    </p>
                    <ul className="flex-1 text-sm text-text-muted">
                      {item.reasons.slice(0, 2).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-sm">
                      <ButtonLink
                        size="sm"
                        to={bookPath(item.service.slug)}
                        onClick={() => click('dashboard', item.service.id)}
                      >
                        Book {item.service.name}
                      </ButtonLink>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(item.service.id)}
                        aria-label={`Not interested in ${item.service.name}`}
                      >
                        Not interested
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            data.rebook.length === 0 && (
              <p className="text-sm text-text-muted">
                No suggestions yet. They appear after your first visits.
              </p>
            )
          )}

          {data.aftercare && (
            <Card padding="lg" as="section" aria-labelledby="aftercare">
              <h3 id="aftercare" className="mb-sm font-semibold">
                Aftercare for your {data.aftercare.after}
              </h3>
              <ul className="flex flex-col gap-sm">
                {data.aftercare.products.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="font-medium text-text">{p.name}</span>{' '}
                      <span className="text-sm text-text-muted">· {formatINR(p.price)}</span>
                      <span className="block text-sm text-text-muted">{p.reason}</span>
                    </span>
                    <Link
                      to="/customer/shop"
                      onClick={() => click('aftercare', undefined, p.id)}
                      className="text-sm font-medium text-primary-hover underline"
                    >
                      See {p.name} in the shop
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {data.quiet_times.length > 0 && (
        <Card padding="lg" as="section" aria-labelledby="quiet-times">
          <h3 id="quiet-times" className="mb-xs font-semibold">
            Quieter times
          </h3>
          <p className="mb-sm text-sm text-text-muted">
            The hours with the fewest visits over the last {data.quiet_times[0].weeks} weeks.
          </p>
          <ul className="flex flex-wrap gap-sm">
            {data.quiet_times.map((q) => (
              <li
                key={q.label}
                className="rounded-full bg-primary-soft px-md py-1 text-sm text-text"
              >
                {q.label}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
