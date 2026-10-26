import { classifyError } from './client';

/** User-facing sign-in error. Generic on purpose: never reveals if an email exists or its role. */
export function loginErrorMessage(error: unknown): string {
  const kind = classifyError(error);
  if (kind === 'invalid' || kind === 'unauthorized' || kind === 'forbidden') {
    return 'Email or password is incorrect for this role.';
  }
  return commonMessage(kind, "Sign-in isn't available right now. Please try again later.");
}

export function registerErrorMessage(error: unknown): string {
  const kind = classifyError(error);
  if (kind === 'invalid' || kind === 'conflict') {
    return "We couldn't create the account with these details. Check them and try again.";
  }
  return commonMessage(kind, "Registration isn't available right now. Please try again later.");
}

function commonMessage(kind: ReturnType<typeof classifyError>, fallback: string): string {
  if (kind === 'rate_limited') return 'Too many attempts. Please wait a few minutes and try again.';
  if (kind === 'network')
    return "We couldn't reach the server. Check your connection and try again.";
  return fallback;
}
