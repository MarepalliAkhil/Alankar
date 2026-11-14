import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRecPrefs, recFeedback, saveRecPrefs, type RecPrefs } from '../../api/recommendations';
import { Button, Card, Checkbox, ErrorState, LoadingState, useToast } from '../ui';
import { MY_RECOMMENDATIONS_KEY } from './ForYou';

const PREFS_KEY = ['my-recommendation-prefs'] as const;

/** Profile: the switch for personal suggestions, the interests the customer chooses, and the
 * services they said "not interested" to (with undo). */
export function RecommendationsCard() {
  const query = useQuery({ queryKey: PREFS_KEY, queryFn: getRecPrefs });
  const client = useQueryClient();
  const toast = useToast();
  const done = (data: RecPrefs) => {
    client.setQueryData(PREFS_KEY, data);
    void client.invalidateQueries({ queryKey: MY_RECOMMENDATIONS_KEY });
  };
  const save = useMutation({
    mutationFn: (body: Parameters<typeof saveRecPrefs>[0]) => saveRecPrefs(body),
    onSuccess: (data) => {
      done(data);
      toast.show({ title: 'Saved', tone: 'success' });
    },
    onError: () => toast.show({ title: 'We could not save that.', tone: 'danger' }),
  });
  const undo = useMutation({
    mutationFn: (service: string) => recFeedback({ action: 'undo', service }),
    onSuccess: () => void client.invalidateQueries({ queryKey: PREFS_KEY }),
  });

  return (
    <Card
      padding="lg"
      as="section"
      aria-labelledby="suggestions-title"
      className="flex flex-col gap-md"
    >
      <h2 id="suggestions-title" className="text-lg font-semibold">
        Personal suggestions
      </h2>
      {query.isPending ? (
        <LoadingState label="Loading your choices…" />
      ) : query.isError ? (
        <ErrorState
          description="We couldn't load your choices."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <Checkbox
            name="suggestions"
            checked={query.data.enabled}
            disabled={save.isPending}
            onChange={(event) => save.mutate({ enabled: event.target.checked, notice_seen: true })}
            label="Suggest services, rebook times and products from my visits."
          />
          <p className="-mt-sm text-xs text-text-muted">
            Only your bookings, ratings and the choices below are used, never your gender, age,
            religion or other personal details. Off means no suggestions, no rebook reminders and no
            personal emails.
          </p>
          <fieldset
            className="flex flex-col gap-sm"
            disabled={!query.data.enabled || save.isPending}
          >
            <legend className="mb-sm text-sm font-semibold text-text">My interests</legend>
            <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
              {query.data.categories.map((cat) => {
                const on = query.data.interests.includes(cat.id);
                return (
                  <Checkbox
                    key={cat.id}
                    name={`interest-${cat.id}`}
                    checked={on}
                    onChange={() =>
                      save.mutate({
                        interests: on
                          ? query.data.interests.filter((id) => id !== cat.id)
                          : [...query.data.interests, cat.id],
                      })
                    }
                    label={cat.name}
                  />
                );
              })}
            </div>
          </fieldset>
          {query.data.not_interested.length > 0 && (
            <div>
              <p className="mb-sm text-sm font-semibold text-text">Not interested</p>
              <ul className="flex flex-wrap gap-sm">
                {query.data.not_interested.map((item) => (
                  <li key={item.id}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => undo.mutate(item.id)}
                      aria-label={`Suggest ${item.name} again`}
                    >
                      {item.name} · Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
