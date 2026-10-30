import { useCallback, useState } from 'react';

const KEY = 'salon-sidebar';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** The staff sidebar's collapsed (icons only) state, remembered in this browser. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(KEY, next ? 'collapsed' : 'expanded');
      } catch {
        // storage blocked: the choice lasts for this page view
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
