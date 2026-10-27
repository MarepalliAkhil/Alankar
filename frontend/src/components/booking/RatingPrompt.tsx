import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  PENDING_RATINGS_KEY,
  getPendingRatings,
  submitRating,
  type PendingRating,
  type RatingPayload,
} from '../../api/billing';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { Button, Card, Textarea, useToast } from '../ui';

/** Shows "Rate your stylist" for each unrated visit. Renders nothing when all are rated. */
export function RatingPrompt() {
  const pending = useQuery({ queryKey: PENDING_RATINGS_KEY, queryFn: getPendingRatings });
  if (!pending.data || pending.data.count === 0) return null;
  return (
    <section aria-label="Rate your stylist" className="flex flex-col gap-md">
      <p className="rounded-nested bg-warning-soft px-md py-sm text-sm text-warning-text">
        Please rate your recent visit. New booking requests are on hold until you do.
      </p>
      {pending.data.results.map((item) => (
        <RatingCard key={item.id} item={item} tags={pending.data.tags} />
      ))}
    </section>
  );
}

function RatingCard({ item, tags }: { item: PendingRating; tags: string[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (payload: RatingPayload) => submitRating(item.id, payload),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Thank you for your feedback' });
      void queryClient.invalidateQueries({ queryKey: PENDING_RATINGS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['booking-options'] });
    },
    onError: (failure) => {
      setError(genericErrorMessage(failure, 'We could not save your rating. Please try again.'));
      void queryClient.invalidateQueries({ queryKey: PENDING_RATINGS_KEY });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stars < 1) {
      setError('Choose 1 to 5 stars.');
      return;
    }
    if (stars <= 2 && comment.trim().length < 3) {
      setError('Please tell us what went wrong (a few words is enough).');
      return;
    }
    setError(null);
    send.mutate({ stars, comment: comment.trim(), tags: picked });
  };

  const toggle = (tag: string) =>
    setPicked((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
    );

  return (
    <Card variant="plain" padding="lg" as="section">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <div>
          <h2 className="text-base font-semibold text-text">
            Rate your stylist{item.stylist_name ? `: ${item.stylist_name}` : ''}
          </h2>
          <p className="text-sm text-text-muted">
            {item.service_name}
            {item.visit_start ? ` · ${formatDateTime(item.visit_start)}` : ''}
          </p>
        </div>
        <fieldset>
          <legend className="sr-only">Stars</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name={`stars-${item.id}`}
                  value={value}
                  checked={stars === value}
                  onChange={() => setStars(value)}
                  className="peer sr-only"
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                />
                <Star
                  aria-hidden="true"
                  className={cn(
                    'h-8 w-8 peer-focus-visible:shadow-focus',
                    value <= stars ? 'fill-warning text-warning' : 'text-text-muted',
                  )}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-sm" role="group" aria-label="Quick tags">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={picked.includes(tag)}
              onClick={() => toggle(tag)}
              className={cn(
                'rounded-full border px-md py-1 text-sm',
                picked.includes(tag)
                  ? 'border-primary bg-primary-soft text-primary-hover'
                  : 'border-border text-text-muted',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        <Textarea
          label={stars > 0 && stars <= 2 ? 'What went wrong? (required)' : 'Comment (optional)'}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
        />
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" loading={send.isPending}>
            Submit rating
          </Button>
        </div>
      </form>
    </Card>
  );
}
