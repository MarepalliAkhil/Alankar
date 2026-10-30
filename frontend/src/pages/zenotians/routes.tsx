import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import type { AboutId } from './model';

const Layout = lazy(() => import('./ZenotiansLayout'));
const Overview = lazy(() => import('./OverviewPage'));
const About = lazy(() => import('./AboutPage'));
const named = <K extends string>(key: K) =>
  lazy(() =>
    import('./ContentPages').then((m) => ({ default: m[key as never] as () => JSX.Element })),
  );
const AboutZenoti = named('AboutZenotiPage');
const Project = named('ProjectPage');
const Mapping = named('MappingPage');
const Decisions = named('DecisionsPage');
const Vision = named('VisionPage');
const Demo = named('DemoPage');
const Contact = named('ContactPage');

const ABOUT: AboutId[] = [
  'summary',
  'education',
  'projects',
  'experience',
  'skills',
  'certifications',
  'achievements',
];

/** Every section of the For Zenotians page has its own shareable URL. */
export const zenotiansRoutes = (
  <Route path="/zenotians" element={<Layout />}>
    <Route index element={<Overview />} />
    <Route path="about" element={<Navigate to="/zenotians/about/summary" replace />} />
    {ABOUT.map((id) => (
      <Route key={id} path={`about/${id}`} element={<About id={id} />} />
    ))}
    <Route path="about-zenoti" element={<AboutZenoti />} />
    <Route path="project" element={<Project />} />
    <Route path="mapping" element={<Mapping />} />
    <Route path="decisions" element={<Decisions />} />
    <Route path="vision" element={<Vision />} />
    <Route path="demo" element={<Demo />} />
    <Route path="contact" element={<Contact />} />
    <Route path="*" element={<Navigate to="/zenotians" replace />} />
  </Route>
);
