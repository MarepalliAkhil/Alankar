import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { conflictSlots } from '../../api/booking';
import { classifyError } from '../../api/client';
import {
  getDeskAppointment,
  getSchedule,
  moveAppointment,
  type DeskAppointment,
  type ScheduleItem,
} from '../../api/desk';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { PlacementDrawer } from '../../components/desk/PlacementDrawer';
import { ScheduleBoard } from '../../components/desk/ScheduleBoard';
import type { BoardMode, DropTarget } from '../../components/desk/schedule-math';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Tabs,
  useToast,
  type TabItem,
} from '../../components/ui';
import { statusClasses } from '../../components/ui/status-styles';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn } from '../../lib/cn';
import { formatDateTime, formatDay, SHOP_TIME_ZONE } from '../../lib/format';
import { appointmentStatusLabels, type AppointmentStatus } from '../../types/appointment';

const modes: TabItem<BoardMode>[] = [
  { id: 'stylist', label: 'By stylist' },
  { id: 'room', label: 'By room' },
];

const legend: AppointmentStatus[] = [
  'awaiting_payment',
  'scheduled',
  'checked_in',
  'in_progress',
  'completed',
  'no_show',
];

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

interface Clash {
  item: ScheduleItem;
  target: DropTarget;
  message: string;
  slots: string[];
}

/** Schedule: one day by stylist or room. Drag a visit, or use "Move to…", to change it. */
export default function SchedulePage() {
  useDocumentTitle('Schedule');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState<BoardMode>('stylist');
  const [moveId, setMoveId] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const [pick, setPick] = useState('');

  const schedule = useQuery({
    queryKey: ['desk-schedule', day],
    queryFn: () => getSchedule(day),
    refetchInterval: 30_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['desk-schedule'] });
    void queryClient.invalidateQueries({ queryKey: ['desk-appointments'] });
  };

  const move = useMutation({
    mutationFn: (input: { item: ScheduleItem; target: DropTarget }) =>
      moveAppointment(input.item.id, {
        stylist: input.target.stylist as string,
        start: input.target.start,
        room: input.target.room,
      }),
    onSuccess: () => {
      setClash(null);
      refresh();
      toast.show({
        tone: 'success',
        title: 'Booking moved',
        description: 'The customer was emailed.',
      });
    },
    onError: (error, input) => {
      refresh();
      const slots = conflictSlots(error);
      if (slots.length || classifyError(error) === 'conflict') {
        setPick('');
        setClash({
          item: input.item,
          target: input.target,
          message: genericErrorMessage(error, 'That time is taken.'),
          slots,
        });
        return;
      }
      toast.show({
        tone: 'danger',
        title: 'Not moved',
        description: genericErrorMessage(error, 'Please try again.'),
      });
    },
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Schedule"
        description="Drag a visit to another time or column, or press Move to… on it. Clashes are checked by the server."
      />
      <div className="flex flex-wrap items-center gap-sm">
        <Button
          size="sm"
          variant="secondary"
          aria-label="Previous day"
          onClick={() => setDay(shiftDay(day, -1))}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <input
          type="date"
          aria-label="Day"
          value={day}
          onChange={(event) => event.target.value && setDay(event.target.value)}
          className="h-9 rounded-input border border-border bg-surface px-3 text-sm text-text focus-visible:shadow-focus focus-visible:outline-none"
        />
        <Button
          size="sm"
          variant="secondary"
          aria-label="Next day"
          onClick={() => setDay(shiftDay(day, 1))}
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDay(today())}>
          Today
        </Button>
        <p className="text-sm text-text-muted">{formatDay(day)}</p>
        <div className="ml-auto">
          <Tabs items={modes} value={mode} onChange={setMode} label="Group by" idPrefix="board" />
        </div>
      </div>

      <ul className="flex flex-wrap gap-sm" aria-label="Status colours">
        {legend.map((status) => (
          <li
            key={status}
            className={cn('rounded-full px-3 py-1 text-xs font-semibold', statusClasses[status])}
          >
            {appointmentStatusLabels[status]}
          </li>
        ))}
      </ul>

      {schedule.isPending ? (
        <LoadingState label="Loading the schedule…" />
      ) : schedule.isError ? (
        <ErrorState
          description="We couldn't load the schedule."
          onRetry={() => void schedule.refetch()}
        />
      ) : schedule.data.closed ? (
        <EmptyState
          icon={<CalendarOff className="h-6 w-6" />}
          title="The salon is closed this day"
          description="Opening hours are set by the admin."
        />
      ) : (
        <>
          {schedule.data.appointments.length === 0 && (
            <p className="text-sm text-text-muted">
              No visits on this day yet. Confirmed bookings appear here.
            </p>
          )}
          {(schedule.data.off ?? []).length > 0 && (
            <p className="text-sm text-text-muted" data-testid="stylists-off">
              Not working this day:{' '}
              {(schedule.data.off ?? []).map((o) => `${o.name} (${o.reason})`).join(', ')}
            </p>
          )}
          <ScheduleBoard
            day={schedule.data}
            mode={mode}
            onDrop={(item, target) => move.mutate({ item, target })}
            onMoveTo={(item) => setMoveId(item.id)}
          />
        </>
      )}

      {moveId && (
        <MoveFromBoard
          id={moveId}
          onClose={() => setMoveId(null)}
          onDone={() => {
            setMoveId(null);
            refresh();
          }}
        />
      )}

      {clash && (
        <Modal
          open
          onClose={() => setClash(null)}
          title="That time is taken"
          description={clash.message}
          footer={
            <>
              <Button variant="ghost" onClick={() => setClash(null)}>
                Leave it where it was
              </Button>
              <Button
                disabled={!pick}
                loading={move.isPending}
                onClick={() =>
                  move.mutate({ item: clash.item, target: { ...clash.target, start: pick } })
                }
              >
                Move to this time
              </Button>
            </>
          }
        >
          {clash.slots.length > 0 ? (
            <SlotPicker
              label="Nearest free times"
              slots={clash.slots}
              value={pick}
              onChange={setPick}
              format={formatDateTime}
            />
          ) : (
            <p className="text-sm text-text-muted">
              No free times nearby. Use Move to… to pick another day or stylist.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Loads the full appointment, then opens the same drawer the Appointments page uses. */
function MoveFromBoard({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const appt = useQuery<DeskAppointment>({
    queryKey: ['desk-appointment', id],
    queryFn: () => getDeskAppointment(id),
  });
  if (appt.isError) {
    return (
      <Modal open onClose={onClose} title="Could not open this booking">
        <ErrorState
          description="Please close this and try again."
          onRetry={() => void appt.refetch()}
        />
      </Modal>
    );
  }
  if (!appt.data) return null;
  return <PlacementDrawer appt={appt.data} mode="move" onClose={onClose} onDone={onDone} />;
}
