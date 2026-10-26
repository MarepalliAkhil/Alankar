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
