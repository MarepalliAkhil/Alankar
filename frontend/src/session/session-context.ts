import { createContext, useContext } from 'react';
import type { LoginPayload, SessionUser } from '../api/auth';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: (payload: LoginPayload) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
