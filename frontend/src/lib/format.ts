const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** "1500.00" -> "₹1,500" (prices include GST). */
export function formatINR(value: string | number): string {
  return inr.format(Number(value));
}

/** 45 -> "45 min", 90 -> "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDurationRange(min: number, max: number): string {
  return min === max ? formatDuration(min) : `${formatDuration(min)} – ${formatDuration(max)}`;
}

/** All times are shown in the shop's time zone, whatever the viewer's device says. */
export const SHOP_TIME_ZONE = 'Asia/Kolkata';
const SHOP_OFFSET = '+05:30';

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: SHOP_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: SHOP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});
const dayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** ISO timestamp -> "Tue, 27 Oct, 3:30 pm" (shop time). */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** ISO timestamp -> "3:30 pm" (shop time). */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "2026-10-27" -> "Tue, 27 Oct". */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** Value of an <input type="datetime-local"> (shop time) -> ISO string with the shop offset. */
export function shopLocalToIso(value: string): string {
  return `${value.length === 16 ? `${value}:00` : value}${SHOP_OFFSET}`;
}

/** ISO time -> value for an <input type="datetime-local"> in shop time ("2026-10-27T09:30"). */
export function isoToShopLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1500.5" -> "₹1,500.50": bills and cash counts show the paise. */
export function formatINRExact(value: string | number): string {
  return inrExact.format(Number(value));
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-10" -> "October 2026". */
export function monthName(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES[(month ?? 1) - 1] ?? key} ${year}`;
}
