import { Route } from 'react-router-dom';
import LegacyZenotians from './LegacyZenotians';
import { ROOT } from './model';
import { lazy } from 'react';

const Layout = lazy(() => import('./ZenotiansLayout'));

export const legacyZenotiansRoutes = [
  <Route key="zen-old" path="/zenotians" element={<LegacyZenotians />} />,
  <Route key="zen-old-any" path="/zenotians/*" element={<LegacyZenotians />} />,
];

/**
 * For Zenotians is one page. Every section keeps a shareable address (/for-zenotians/contact,
 * /for-zenotians/about/skills, ...): opening one shows the same page at that section. Addresses of
 * removed sections (decisions, questions, vision) open the page at the top.
 */
export const zenotiansRoutes = <Route path={`${ROOT}/*`} element={<Layout />} />;
