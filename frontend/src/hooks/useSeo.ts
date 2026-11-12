import { usePageHead } from '../seo/head';

/**
 * Kept for older imports: the head of a public page now comes from one table
 * (src/seo/seo-data.js), so the title and description arguments are no longer used.
 */
export function useSeo(path: string): void {
  usePageHead(path);
}
