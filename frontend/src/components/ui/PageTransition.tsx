import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * A short fade-and-rise when the page changes (CSS only: opacity and transform). Keyed on the
 * path, so it plays once per page section. With reduced motion it is instant.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Keyed on the section ("/customer/chat"), not the whole path, so opening another item on the
  // same page (another chat, another order) does not replay the transition or reset the page.
  const section = pathname.split('/').slice(0, 3).join('/');
  return (
    <div key={section} className="page-enter">
      {children}
    </div>
  );
}
