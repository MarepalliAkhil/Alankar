import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { Ban, CalendarClock, GripVertical, MapPin } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { ScheduleDay, ScheduleItem } from '../../api/desk';
import { useBox } from '../../hooks/useBox';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { statusClasses } from '../ui/status-styles';
import {
  blockGeometry,
  BoardMode,
  COLUMN_WIDTH,
  NO_ROOM,
  PX_PER_MINUTE,
  resolveDrop,
  type DropTarget,
} from './schedule-math';

interface Column {
  key: string;
  label: string;
}

interface ScheduleBoardProps {
  day: ScheduleDay;
  mode: BoardMode;
  /** Called after a drop with the visit and where it landed. */
  onDrop: (item: ScheduleItem, target: DropTarget) => void;
  /** The "Move to…" button on a block. */
  onMoveTo: (item: ScheduleItem) => void;
}

/** Keyboard dragging moves a block one time step up/down or one column left/right. */
const keyboardGetter =
  (stepPx: number): KeyboardCoordinateGetter =>
  (event, { currentCoordinates }) => {
    const { x, y } = currentCoordinates;
    switch (event.code) {
      case 'ArrowDown':
        event.preventDefault();
        return { x, y: y + stepPx };
      case 'ArrowUp':
        event.preventDefault();
        return { x, y: y - stepPx };
      case 'ArrowRight':
        event.preventDefault();
        return { x: x + COLUMN_WIDTH, y };
      case 'ArrowLeft':
        event.preventDefault();
        return { x: x - COLUMN_WIDTH, y };
      default:
        return undefined;
    }
  };

/**
 * One day, one column per stylist (or room), time running downwards. Visits can be dragged to
 * another time or column with the mouse, touch or keyboard (Space to pick up, arrows to move,
 * Space to drop). Each block also has a "Move to…" button, so nothing needs dragging.
 */
export function ScheduleBoard({ day, mode, onDrop, onMoveTo }: ScheduleBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardGetter(day.step_minutes * PX_PER_MINUTE),
    }),
  );

  const columns: Column[] = useMemo(() => {
    if (mode === 'stylist') {
      return day.stylists.map((s) => ({ key: s.id, label: s.display_name }));
    }
    return [
      ...day.rooms.map((r) => ({ key: r.id, label: r.name })),
      { key: NO_ROOM, label: 'No room' },
    ];
  }, [day.rooms, day.stylists, mode]);

  const hours = useMemo(() => {
    if (!day.open || !day.close) return [];
    const open = new Date(day.open).getTime();
    const close = new Date(day.close).getTime();
    const marks: string[] = [];
    for (let t = open; t < close; t += 3_600_000) marks.push(new Date(t).toISOString());
    return marks;
  }, [day.open, day.close]);

  const height =
    day.open && day.close
      ? ((new Date(day.close).getTime() - new Date(day.open).getTime()) / 60_000) * PX_PER_MINUTE
      : 0;

  const onDragEnd = (event: DragEndEvent) => {
    const item = day.appointments.find((a) => a.id === event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!item || !over?.startsWith('col:')) return;
    const target = resolveDrop({
      item,
      deltaY: event.delta.y,
      column: over.slice(4),
      mode,
      stepMinutes: day.step_minutes,
    });
    if (target) onDrop(item, target);
  };

  if (!day.open) return null;
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-border bg-surface">
            <div className="h-10 border-b border-border" />
            <TimeGutter hours={hours} height={height} />
          </div>
          {columns.map((column) => (
            <DayColumn
              key={column.key}
              column={column}
              open={day.open as string}
              height={height}
              hours={hours.length}
              items={day.appointments.filter((a) =>
                mode === 'stylist'
                  ? a.stylist_id === column.key
                  : (a.room_id ?? NO_ROOM) === column.key,
              )}
              onMoveTo={onMoveTo}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function TimeGutter({ hours, height }: { hours: string[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useBox(ref, { height });
  return (
    <div ref={ref} className="relative text-xs text-text-muted" aria-hidden="true">
      {hours.map((hour, index) => (
        <HourMark key={hour} iso={hour} index={index} />
      ))}
    </div>
  );
}

function HourMark({ iso, index }: { iso: string; index: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useBox(ref, { top: index * 60 * PX_PER_MINUTE });
  return (
    <span ref={ref} className="absolute right-2 -translate-y-1/2 first:translate-y-0">
      {formatTime(iso)}
    </span>
  );
}

function DayColumn({
  column,
  open,
  height,
  hours,
  items,
  onMoveTo,
}: {
  column: Column;
  open: string;
  height: number;
  hours: number;
  items: ScheduleItem[];
  onMoveTo: (item: ScheduleItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}` });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useBox(bodyRef, { height, width: COLUMN_WIDTH });
  return (
    <div className="shrink-0 border-r border-border last:border-r-0">
      <div
        className="flex h-10 items-center justify-center border-b border-border px-2 text-sm font-semibold text-text"
        role="columnheader"
      >
        <span className="truncate">{column.label}</span>
      </div>
      <div
        ref={(node) => {
          bodyRef.current = node;
          setNodeRef(node);
        }}
        data-column={column.key}
        className={cn('relative', isOver && 'bg-primary-soft')}
      >
        {Array.from({ length: hours }).map((_, index) => (
          <HourLine key={index} index={index} />
        ))}
        {items.map((item) => (
          <VisitBlock key={item.id} item={item} open={open} onMoveTo={onMoveTo} />
        ))}
      </div>
    </div>
  );
}

function HourLine({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useBox(ref, { top: index * 60 * PX_PER_MINUTE });
  return <div ref={ref} aria-hidden="true" className="absolute inset-x-0 border-t border-border" />;
}

function VisitBlock({
  item,
  open,
  onMoveTo,
}: {
  item: ScheduleItem;
  open: string;
  onMoveTo: (item: ScheduleItem) => void;
}) {
  const movable = item.actions.includes('move');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !movable,
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const { top, height } = blockGeometry(item, open);
  useBox(nodeRef, {
    top,
    height,
    left: 4,
    width: COLUMN_WIDTH - 8,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : '',
  });
  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        setNodeRef(node);
      }}
      data-visit={item.id}
      data-status={item.status}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-nested border border-border px-2 py-1 text-xs shadow-sm',
        statusClasses[item.status],
        isDragging && 'z-20 opacity-80 shadow-lg',
      )}
    >
      <div className="flex items-center gap-1">
        {movable && (
          <button
            type="button"
            aria-label={`Drag ${item.service_name} for ${item.customer_name}`}
            className="-ml-1 cursor-grab rounded p-0.5 focus-visible:shadow-focus focus-visible:outline-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="font-semibold">{formatTime(item.start)}</span>
        <span className="ml-auto flex items-center gap-1">
          {item.arrived_at && (
            <span title="Customer says they have arrived">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Customer says they have arrived</span>
            </span>
          )}
          {item.reschedule_requested && (
            <span title="Customer asked to reschedule">
              <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Customer asked to reschedule</span>
            </span>
          )}
          {item.cancel_requested && (
            <span title="Customer asked to cancel">
              <Ban aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Customer asked to cancel</span>
            </span>
          )}
          {movable && (
            <button
              type="button"
              onClick={() => onMoveTo(item)}
              className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              Move to…
            </button>
          )}
        </span>
      </div>
      <p className="truncate font-medium">{item.service_name}</p>
      <p className="truncate">
        {item.customer_name} · {item.status_label}
      </p>
    </div>
  );
}
