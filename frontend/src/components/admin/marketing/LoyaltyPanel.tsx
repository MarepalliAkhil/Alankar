import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { getLoyalty, saveLoyalty, type LoyaltyRules } from '../../../api/marketing';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import { Button, Card, ErrorState, Input, LoadingState, useToast } from '../../ui';

/** How customers earn and spend points. Changes apply to the next bill. */
export function LoyaltyPanel() {
  const rules = useQuery({ queryKey: ['mk-loyalty'], queryFn: getLoyalty });
  return (
    <Card variant="dense" as="section" aria-label="Loyalty rules">
      <h2 className="text-lg font-semibold text-text">Loyalty points</h2>
      <p className="mt-1 text-sm text-text-muted">
        Customers earn points on what they pay and can spend them at the counter. Changes apply to
        the next bill; points already earned keep their value.
      </p>
      <div className="mt-md">
        {rules.isPending ? (
          <LoadingState label="Loading loyalty rules…" />
        ) : rules.isError ? (
          <ErrorState
            description="We couldn't load the loyalty rules."
            onRetry={() => void rules.refetch()}
          />
        ) : (
          <LoyaltyForm initial={rules.data} />
        )}
      </div>
    </Card>
  );
}

function LoyaltyForm({ initial }: { initial: LoyaltyRules }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    earn: String(initial.loyalty_points_per_100),
    value: String(initial.loyalty_point_value),
    max: String(initial.loyalty_max_redeem_percent),
  });
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: Partial<LoyaltyRules>) => saveLoyalty(body),
    onSuccess: (data) => {
      setProblem('');
      setFields({});
      queryClient.setQueryData(['mk-loyalty'], data);
      toast.show({ tone: 'success', title: 'Loyalty rules saved' });
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save.'),
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nums = [form.earn, form.value, form.max];
    if (nums.some((n) => !/^\d+$/.test(n))) return setProblem('Use whole numbers.');
    if (Number(form.value) < 1) return setProblem('A point must be worth at least ₹1.');
    if (Number(form.max) > 100) return setProblem('The share of a bill cannot be more than 100%.');
    save.mutate({
      loyalty_points_per_100: Number(form.earn),
      loyalty_point_value: Number(form.value),
      loyalty_max_redeem_percent: Number(form.max),
    });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-md">
      <div className="grid gap-md md:grid-cols-3">
        <Input
          label="Points earned per ₹100 paid"
          inputMode="numeric"
          value={form.earn}
          error={fields.loyalty_points_per_100}
          onChange={(e) => setForm((f) => ({ ...f, earn: e.target.value }))}
        />
        <Input
          label="Rupees one point is worth"
          inputMode="numeric"
          value={form.value}
          error={fields.loyalty_point_value}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
        />
        <Input
          label="Most of a bill points can pay (%)"
          inputMode="numeric"
          value={form.max}
          error={fields.loyalty_max_redeem_percent}
          onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div>
        <Button type="submit" loading={save.isPending}>
          Save loyalty rules
        </Button>
      </div>
    </form>
  );
}
