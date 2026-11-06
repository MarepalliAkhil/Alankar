import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../api/auth';
import { SessionProvider } from './SessionProvider';
import { SessionContext } from './session-context';

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn(),
  login: vi.fn(),
}));

const customer = { id: 'u1', role: 'customer', email: 'c@x.example.com', name: 'C' } as never;

let signIn: (p: never) => Promise<unknown>;
function Probe() {
  const ctx = useContext(SessionContext)!;
  signIn = ctx.signIn as never;
  return <p>status:{ctx.status}</p>;
}

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe('SessionProvider', () => {
  beforeEach(() => vi.resetAllMocks());

  it('a slow first look at the session cannot undo a sign-in made meanwhile', async () => {
    vi.mocked(auth.ensureCsrf).mockResolvedValue(undefined);
    let answerLate: (v: null) => void = () => undefined;
    vi.mocked(auth.getSession).mockReturnValue(new Promise((r) => (answerLate = r)));
    vi.mocked(auth.login).mockResolvedValue(customer);
    mount();
    expect(screen.getByText('status:loading')).toBeInTheDocument();
    await act(async () => {
      await signIn({ role: 'customer', email: 'c@x.example.com', password: 'x' } as never);
    });
    expect(screen.getByText('status:authenticated')).toBeInTheDocument();
    await act(async () => answerLate(null)); // "nobody is signed in", arriving too late
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeInTheDocument());
  });

  it('still becomes anonymous when nobody signs in', async () => {
    vi.mocked(auth.ensureCsrf).mockResolvedValue(undefined);
    vi.mocked(auth.getSession).mockResolvedValue(null);
    mount();
    await waitFor(() => expect(screen.getByText('status:anonymous')).toBeInTheDocument());
  });
});
