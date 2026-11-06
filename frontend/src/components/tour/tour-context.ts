import { createContext, useContext } from 'react';
import type { TourDefinition } from './types';

export interface TourValue {
  /** The role has a tour at all. */
  available: boolean;
  /** Server state has loaded: tips and the auto-start wait for this. */
  ready: boolean;
  /** An invite or a running tour is on screen: page tips stay quiet meanwhile. */
  busy: boolean;
  definition: TourDefinition | undefined;
  /** Run the tour now (the "Take the tour" row). */
  start: () => void;
  isDismissed: (tipId: string) => boolean;
  dismissTip: (tipId: string) => void;
}

export const TourContext = createContext<TourValue | null>(null);

export function useTour(): TourValue | null {
  return useContext(TourContext);
}
