import type { ScheduleItem } from '../../api/desk';

export type BoardMode = 'stylist' | 'room';

/** Column key used for visits that have no room. */
export const NO_ROOM = 'none';

/** Pixels per minute on the board (a 15-minute step is 36 px tall). */
export const PX_PER_MINUTE = 2.4;
/** Width of one column; the keyboard moves a dragged visit by this much sideways. */
export const COLUMN_WIDTH = 176;

export interface DropTarget {
  start: string;
  stylist: string | null;
  room: string | null;
}

/**
 * Where a dragged visit lands. `deltaY` is how far it moved (pixels), `column` the column it
 * was dropped on. Time snaps to the board's step. Returns null when nothing changed or the
 * drop makes no sense (no stylist to keep, unknown column).
 */
export function resolveDrop(input: {
  item: ScheduleItem;
  deltaY: number;
  column: string | null;
  mode: BoardMode;
  stepMinutes: number;
}): DropTarget | null {
  const { item, deltaY, column, mode, stepMinutes } = input;
  if (!column) return null;
  const moved = Math.round(deltaY / PX_PER_MINUTE / stepMinutes) * stepMinutes;
  const start = new Date(new Date(item.start).getTime() + moved * 60_000).toISOString();
  const stylist = mode === 'stylist' ? column : item.stylist_id;
  const room = mode === 'room' ? (column === NO_ROOM ? null : column) : item.room_id;
  if (!stylist) return null;
  const sameTime = new Date(start).getTime() === new Date(item.start).getTime();
  if (sameTime && stylist === item.stylist_id && room === item.room_id) return null;
  return { start, stylist, room };
}

/** Top and height (pixels) of a visit's block, measured from the opening time. */
export function blockGeometry(item: ScheduleItem, openIso: string) {
  const top =
    ((new Date(item.start).getTime() - new Date(openIso).getTime()) / 60_000) * PX_PER_MINUTE;
  const height = Math.max(item.duration_minutes * PX_PER_MINUTE, 36);
  return { top, height };
}
