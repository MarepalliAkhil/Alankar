import { useOutletContext } from 'react-router-dom';
import type { ZenotiansContent } from '../../api/zenotians';
import type { MenuEntry } from './model';

export interface ZenotiansContext {
  content: ZenotiansContent;
  menu: MenuEntry[];
}

/** The page content and the menu of visible sections, from the layout route. */
export const useZenotians = () => useOutletContext<ZenotiansContext>();
