import { createContext, useContext } from 'react';
import type { ZenotiansContent } from '../../api/zenotians';
import type { MenuEntry } from './model';

export interface ZenotiansContext {
  content: ZenotiansContent;
  menu: MenuEntry[];
}

/** The page content and the menu of visible sections, provided by the page (ZenotiansLayout). */
export const ZenotiansData = createContext<ZenotiansContext | null>(null);

export function useZenotians(): ZenotiansContext {
  const value = useContext(ZenotiansData);
  if (!value) throw new Error('useZenotians must be used inside the For Zenotians page');
  return value;
}
