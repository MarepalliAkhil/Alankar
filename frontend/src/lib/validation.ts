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
