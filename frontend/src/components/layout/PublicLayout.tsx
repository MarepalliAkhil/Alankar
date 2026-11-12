import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { hasHero } from './hero-pages';
import { Splash } from '../brand/Splash';
import { ChatWidget } from '../chatbot/ChatWidget';
import { ErrorBoundary } from '../ErrorBoundary';
import { CommandBar } from '../ui/CommandBar';
import { DelayedLoader } from '../ui/Loader';
import { PageBackground } from '../ui/PageBackground';
import { PageTransition } from '../ui/PageTransition';
import { AnnouncementBar } from './AnnouncementBar';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

export function PublicLayout() {
  const { pathname } = useLocation();
  const hero = hasHero(pathname);
  return (
    <div className="flex min-h-screen min-h-dvh flex-col">
      <PageBackground />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <Navbar />
      <main
        id="main"
        data-under-nav={hero || undefined}
        className={hero ? 'under-nav min-w-0 flex-1' : 'min-w-0 flex-1'}
      >
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<DelayedLoader label="Loading page…" />}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <CommandBar />
      <ChatWidget />
      <Splash />
    </div>
  );
}
