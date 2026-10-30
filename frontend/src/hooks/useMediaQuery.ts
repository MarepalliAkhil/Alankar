import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  try {
    return window.matchMedia?.(query).matches ?? false;
  } catch {
    return false;
  }
}

/** True while a CSS media query matches (false where matchMedia is missing, e.g. old browsers). */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    let list: MediaQueryList | undefined;
    try {
      list = window.matchMedia?.(query);
    } catch {
      list = undefined;
    }
    setValue(list?.matches ?? false);
    if (!list?.addEventListener) return;
    const onChange = (event: MediaQueryListEvent) => setValue(event.matches);
    list.addEventListener('change', onChange);
    return () => list?.removeEventListener('change', onChange);
  }, [query]);
  return value;
}
