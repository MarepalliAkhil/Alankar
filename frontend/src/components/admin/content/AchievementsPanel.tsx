import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  createAchievement,
  deleteAchievement,
  listAchievements,
  updateAchievement,
  type Achievement,
} from '../../../api/content';
import { errorDetail } from '../../../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  useToast,
} from '../../ui';

/** The big numbers on the home page ("5000+ happy clients"). Real numbers only. */
export function AchievementsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ['content-achievements'], queryFn: listAchievements });
  const [form, setForm] = useState({ label: '', value: '', suffix: '' });
  const [problem, setProblem] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['content-achievements'] });
    void queryClient.invalidateQueries({ queryKey: ['site'] });
  };
  const add = useMutation({
    mutationFn: () =>
      createAchievement({
        label: form.label.trim(),
        value: Number(form.value),
        suffix: form.suffix.trim(),
      }),
    onSuccess: () => {
      setForm({ label: '', value: '', suffix: '' });
      setProblem('');
      refresh();
      toast.show({ tone: 'success', title: 'Achievement added' });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not add it.'),
  });
  const flip = useMutation({
    mutationFn: (a: Achievement) => updateAchievement(a.id, { is_active: !a.is_active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (a: Achievement) => deleteAchievement(a.id),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.label.trim() || !/^\d+$/.test(form.value)) {
      return setProblem('Give a label and a whole number.');
    }
    add.mutate();
  };
  return (
    <Card variant="dense" as="section" aria-label="Achievements">
      <h2 className="text-lg font-semibold text-text">Achievements</h2>
      <p className="mt-1 text-sm text-text-muted">
        Numbers shown on the home page. Only use figures you can stand behind.
      </p>
      <div className="mt-md">
        {rows.isPending ? (
          <LoadingState label="Loading achievements…" />
        ) : rows.isError ? (
          <ErrorState
            description="We couldn't load the achievements."
            onRetry={() => void rows.refetch()}
          />
        ) : rows.data.length === 0 ? (
          <EmptyState title="None yet" description="Add your first achievement below." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {rows.data.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded-nested border border-border p-md"
              >
                <p className="text-text">
                  <span className="font-semibold">
                    {a.value}
                    {a.suffix}
                  </span>{' '}
                  {a.label}{' '}
                  <Badge tone={a.is_active ? 'success' : 'neutral'}>
                    {a.is_active ? 'Shown' : 'Hidden'}
                  </Badge>
                </p>
                <div className="flex gap-sm">
                  <Button
                    loading={flip.isPending && flip.variables?.id === a.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => flip.mutate(a)}
                  >
                    {a.is_active ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    loading={remove.isPending && remove.variables?.id === a.id}
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => remove.mutate(a)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        noValidate
        onSubmit={submit}
        className="mt-md grid gap-sm sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <Input
          label="Label"
          value={form.label}
          maxLength={80}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        />
        <Input
          label="Number"
          inputMode="numeric"
          value={form.value}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
        />
        <Input
          label="Suffix"
          hint="+ or %"
          value={form.suffix}
          maxLength={10}
          onChange={(e) => setForm((f) => ({ ...f, suffix: e.target.value }))}
        />
        <Button type="submit" loading={add.isPending}>
          Add
        </Button>
      </form>
      {problem && (
        <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
    </Card>
  );
}
