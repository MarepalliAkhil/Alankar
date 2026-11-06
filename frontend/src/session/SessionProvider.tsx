import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ensureCsrf,
  getSession,
  login,
  needsOtp,
  needsTwoFactor,
  verifyOtp,
  verifyTwoFactor,
  logout,
  refreshSession,
  type LoginPayload,
  type OtpPurpose,
  type SessionUser,
} from '../api/auth';
import { setSessionExpiredHandler } from '../api/client';
import { SessionContext, type SessionStatus } from './session-context';

const RENEW_EVERY_MS = 12 * 60 * 1000;

interface State {
  status: SessionStatus;
  user: SessionUser | null;
}

/**
 * Knows who is signed in. On load: get a CSRF cookie, then ask the server (`/auth/session/`).
 * The session itself lives only in httpOnly cookies; the browser never sees the tokens.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'loading', user: null });
  // Counts every change of who is signed in (sign in, verify, sign out, expiry). The first look
  // at the session (below) is slow on a busy server; if the person signs in while it is still
  // on its way, its late "nobody is signed in" answer must not undo the sign-in.
  const epoch = useRef(0);

  const becomeAnonymous = useCallback(() => {
    epoch.current += 1;
    setState({ status: 'anonymous', user: null });
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = epoch.current;
    const stale = () => cancelled || epoch.current !== startedAt;
    (async () => {
      try {
        await ensureCsrf();
      } catch {
        // The API may be down; getSession below decides the state.
      }
      try {
        const me = await getSession();
        if (!stale()) {
          setState(
            me ? { status: 'authenticated', user: me } : { status: 'anonymous', user: null },
          );
        }
      } catch {
        if (!stale()) setState({ status: 'anonymous', user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Renew the cookies before the 15-minute access token expires (no 401s mid-session).
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const timer = window.setInterval(() => {
      refreshSession().catch(() => becomeAnonymous());
    }, RENEW_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [state.status, becomeAnonymous]);

  useEffect(() => {
    setSessionExpiredHandler(becomeAnonymous);
    return () => setSessionExpiredHandler(null);
  }, [becomeAnonymous]);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const result = await login(payload);
    if (!needsOtp(result) && !needsTwoFactor(result)) {
      epoch.current += 1;
      setState({ status: 'authenticated', user: result });
    }
    return result;
  }, []);

  const completeOtp = useCallback(
    async (email: string, code: string, purpose: OtpPurpose, rememberDevice = false) => {
      const user = await verifyOtp(email, code, purpose, rememberDevice);
      epoch.current += 1;
      setState({ status: 'authenticated', user });
      return user;
    },
    [],
  );

  const completeTwoFactor = useCallback(async (challenge: string, code: string) => {
    const user = await verifyTwoFactor(challenge, code);
    epoch.current += 1;
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      becomeAnonymous();
    }
  }, [becomeAnonymous]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      signIn,
      completeOtp,
      completeTwoFactor,
      signOut,
    }),
    [state, signIn, completeOtp, completeTwoFactor, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
