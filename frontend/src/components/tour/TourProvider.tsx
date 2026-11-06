import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  clearTour,
  getTourProgress,
  setTourStatus,
  type TourProgress,
  type TourStatus,
} from '../../api/tours';
import type { Role } from '../../policy/policy';
import { TourContext, type TourValue } from './tour-context';
import { Tour } from './Tour';
import { tipKey, tourFor, tourKey } from './tours';

type Mode = 'idle' | 'running';

/**
 * Owns the tour state for the signed-in area. The progress is read from and written to the server
 * (so it follows the person to another phone). The first time a customer arrives, with nothing
 * stored yet, the tour starts by itself; anything stored (finished, skipped, "not now") means it
 * never starts by itself again. The "Take the tour" row calls `start` to run it again.
 */
export function TourProvider({
  role,
  firstName = '',
  isPhone,
  openMenu,
  onNavigate,
  children,
}: {
  role: Role;
  /** Used in Meera's lines. */
  firstName?: string;
  isPhone: boolean;
  openMenu: (open: boolean) => void;
  /** Where the finale's button goes (the app's router). */
  onNavigate?: (to: string) => void;
  children: ReactNode;
}) {
  const definition = tourFor(role);
  const queryClient = useQueryClient();
  const progress = useQuery({
    queryKey: ['tours'],
    queryFn: async () => {
      const stored = await getTourProgress();
      // No answer from the server means "unknown", never "nothing stored": the tour must not
      // start by itself on a guess.
      if (!stored) throw new Error('Tour progress is not available');
      return stored;
    },
    staleTime: Infinity,
    retry: false,
  });
  const [mode, setMode] = useState<Mode>('idle');
  const [restarted, setRestarted] = useState(false);
  const invited = useRef(false);
  const key = definition ? tourKey(definition.id) : '';

  const save = useCallback(
    (name: string, status: TourStatus) => {
      queryClient.setQueryData<TourProgress>(['tours'], (old) => ({
        ...(old ?? {}),
        [name]: status,
      }));
      void Promise.resolve(setTourStatus(name, status)).catch(() => undefined);
    },
    [queryClient],
  );

  // First run: start once. Anything stored (finished, skipped, "not now") means never again.
  useEffect(() => {
    if (!definition || !progress.data || invited.current) return;
    invited.current = true;
    if (progress.data[key] === undefined) setMode('running');
  }, [definition, progress.data, key]);

  const finish = useCallback(
    (status: TourStatus) => {
      setMode('idle');
      if (isPhone) openMenu(false);
      if (key) save(key, status);
    },
    [isPhone, openMenu, key, save],
  );
  const onFinish = useCallback(() => finish('completed'), [finish]);
  const onSkip = useCallback(() => finish('skipped'), [finish]);
  const onNotNow = useCallback(() => finish('dismissed'), [finish]);
  const onAction = useCallback(
    (to: string) => {
      finish('completed');
      onNavigate?.(to);
    },
    [finish, onNavigate],
  );

  const start = useCallback(() => {
    if (!definition) return;
    // Restarting clears the stored answer on the server, then runs the tour from step one.
    queryClient.setQueryData<TourProgress>(['tours'], (old) => {
      const next = { ...(old ?? {}) };
      delete next[key];
      return next;
    });
    void Promise.resolve(clearTour(key)).catch(() => undefined);
    openMenu(false);
    setRestarted(true);
    setMode('running');
  }, [definition, key, openMenu, queryClient]);

  const value = useMemo<TourValue>(
    () => ({
      available: Boolean(definition),
      ready: progress.isSuccess,
      busy: mode !== 'idle',
      definition,
      start,
      isDismissed: (tipId) => progress.data?.[tipKey(tipId)] !== undefined,
      dismissTip: (tipId) => save(tipKey(tipId), 'dismissed'),
    }),
    [definition, mode, progress.data, progress.isSuccess, save, start],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {definition && mode === 'running' && (
        <Tour
          definition={definition}
          name={firstName}
          isPhone={isPhone}
          openMenu={openMenu}
          onFinish={onFinish}
          onSkip={onSkip}
          onNotNow={onNotNow}
          onAction={onAction}
          restarted={restarted}
        />
      )}
    </TourContext.Provider>
  );
}
