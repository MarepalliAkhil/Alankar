import { createContext } from 'react';

/**
 * Where a PageHeader sits. A normal page: its title is the page's one H1 and it shows its own
 * breadcrumb. Inside a long page made of sections (For Zenotians) a section's title is an H2 (an
 * H3 inside a group) and the page shows no per-section breadcrumbs.
 */
export const HeadingLevel = createContext<{ level: 1 | 2 | 3; breadcrumbs: boolean }>({
  level: 1,
  breadcrumbs: true,
});
