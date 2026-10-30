import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { listAppointments, type Scope } from '../../api/stylist';
import { PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, SkeletonCards, TabPanel, Tabs } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { StylistError, VisitCardView } from './common';

const tabs = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
] as const;

export default function MyAppointmentsPage() {
  useDocumentTitle('My Appointments');
  const [scope, setScope] = useState<Exclude<Scope, 'today'>>('upcoming');
  const visits = useQuery({
    queryKey: ['stylist', scope],
    queryFn: () => listAppointments(scope),
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="My Appointments"
        description="Your confirmed visits and the ones you have completed. Open one to see allergies, preferences and history."
      />
      <Tabs
        items={tabs}
        value={scope}
        onChange={setScope}
        label="Appointments"
        idPrefix="stylist-appts"
      />
      <TabPanel idPrefix="stylist-appts" id={scope}>
        {visits.isPending ? (
          <SkeletonCards count={4} label="Loading appointments…" />
        ) : visits.isError ? (
          <StylistError error={visits.error} onRetry={() => void visits.refetch()} />
        ) : visits.data.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title={scope === 'upcoming' ? 'No upcoming visits' : 'No past visits yet'}
          />
        ) : (
          <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {visits.data.map((visit) => (
              <li key={visit.id}>
                <VisitCardView visit={visit} withDate />
              </li>
            ))}
          </ul>
        )}
      </TabPanel>
    </section>
  );
}
