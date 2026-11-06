import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
  return (
    <div className="flex min-h-screen flex-col">
      <PageBackground />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <Navbar />
      <main id="main" className="flex-1">
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
    </div>
  );
}
