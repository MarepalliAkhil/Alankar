import type { ZodError } from 'zod';

/** First error message per top-level field, for showing next to inputs. */
export function fieldErrors<K extends string = string>(
  error: ZodError,
): Partial<Record<K, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) out[key] = issue.message;
  }
  return out as Partial<Record<K, string>>;
}

/** "+91 98765-43210" -> "9876543210" (same rule as the server). */
export const normalisePhone = (value: string) =>
  value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');

export const isIndianMobile = (value: string) => /^[6-9]\d{9}$/.test(normalisePhone(value));
