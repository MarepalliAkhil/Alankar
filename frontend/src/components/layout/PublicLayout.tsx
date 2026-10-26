import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ErrorBoundary';
import { LoadingState } from '../ui/Skeleton';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import { PageContainer } from './PageContainer';

export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-toast focus:rounded-full focus:bg-surface focus:px-md focus:py-sm focus:text-text focus:shadow-raised"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Suspense
            fallback={
              <PageContainer>
                <LoadingState label="Loading page…" lines={4} className="py-2xl" />
              </PageContainer>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
