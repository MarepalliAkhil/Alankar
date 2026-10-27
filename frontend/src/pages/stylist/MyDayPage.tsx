import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { startVisit, listAppointments } from '../../api/stylist';
import { errorDetail } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, LoadingState, useToast } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { StylistError, VisitCardView } from './common';

/** My Day: today's visits as cards, with Start on the ones that are checked in. */
export default function MyDayPage() {
  useDocumentTitle('My Day');
  const toast = useToast();
  const queryClient = useQueryClient();
  const visits = useQuery({
    queryKey: ['stylist', 'today'],
    queryFn: () => listAppointments('today'),
    refetchInterval: 60000,
  });
  const start = useMutation({
    mutationFn: startVisit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stylist'] });
      toast.show({ title: 'Service started', tone: 'success' });
    },
    onError: (error) =>
      toast.show({
        title: 'Could not start',
        description: errorDetail(error) ?? 'Please try again.',
        tone: 'danger',
      }),
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="My Day"
        description="Today's visits. A visit can be started once the front desk has checked the guest in."
      />
      {visits.isPending ? (
        <LoadingState label="Loading your day…" />
      ) : visits.isError ? (
        <StylistError error={visits.error} onRetry={() => void visits.refetch()} />
      ) : visits.data.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="No visits today"
          description="Visits appear here once they are scheduled with you."
        />
      ) : (
        <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {visits.data.map((visit) => (
            <li key={visit.id}>
              <VisitCardView
                visit={visit}
                onStart={(id) => start.mutate(id)}
                starting={start.isPending && start.variables === visit.id}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
