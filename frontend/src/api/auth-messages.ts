import { classifyError, errorDetail } from './client';

/** User-facing sign-in error. Generic on purpose: never reveals if an email exists or its role. */
export function loginErrorMessage(error: unknown): string {
  const kind = classifyError(error);
  if (kind === 'invalid' || kind === 'unauthorized' || kind === 'forbidden') {
    return 'Email or password is incorrect for this role.';
  }
  if (kind === 'rate_limited') {
    return errorDetail(error) ?? 'Too many attempts. Please wait 15 minutes and try again.';
  }
  return commonMessage(kind, "Sign-in isn't available right now. Please try again later.");
}

export function registerErrorMessage(error: unknown): string {
  const kind = classifyError(error);
  if (kind === 'invalid' || kind === 'conflict') {
    return 'Please check the highlighted fields and try again.';
  }
  return commonMessage(kind, "Registration isn't available right now. Please try again later.");
}

export function genericErrorMessage(error: unknown, fallback: string): string {
  const kind = classifyError(error);
  if (kind === 'invalid' || kind === 'not_found') return errorDetail(error) ?? fallback;
  return commonMessage(kind, fallback);
}

function commonMessage(kind: ReturnType<typeof classifyError>, fallback: string): string {
  if (kind === 'rate_limited') return 'Too many attempts. Please wait a few minutes and try again.';
  if (kind === 'network')
    return "We couldn't reach the server. Check your connection and try again.";
  return fallback;
}
