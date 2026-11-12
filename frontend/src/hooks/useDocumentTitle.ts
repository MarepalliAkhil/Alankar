import { useEffect } from 'react';
import { applyPrivateHead } from '../seo/head';

/**
 * Title for a page that is not part of the public site (signed-in screens, 404, 403, errors):
 * "Page | Alankar", plus "noindex, nofollow" and no canonical or share tags. Public pages use
 * `usePageHead` from src/seo/head.ts instead.
 */
export function useDocumentTitle(title?: string, description?: string): void {
  useEffect(() => {
    applyPrivateHead(title, description);
  }, [title, description]);
}
