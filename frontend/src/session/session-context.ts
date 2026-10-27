import { createContext, useContext } from 'react';
import type { LoginPayload, LoginResult, OtpPurpose, SessionUser } from '../api/auth';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Staff get a user back; customers may get an OtpPending to finish with `completeOtp`. */
  signIn: (payload: LoginPayload) => Promise<LoginResult>;
  completeOtp: (email: string, code: string, purpose: OtpPurpose) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
