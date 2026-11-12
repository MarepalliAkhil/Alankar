import { MessageCircle, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AlankarLogo } from '../../components/brand/AlankarLogo';
import { openChat } from '../../components/chatbot/chat-events';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, Card } from '../../components/ui';
import { openCommandBar } from '../../components/ui/command-events';
import { brand } from '../../config/brand';
import { divisions } from '../../config/divisions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SPECIAL_PAGES } from '../../seo/seo-data.js';

const link =
  'touch-target inline-flex min-h-11 items-center justify-center rounded-full border border-border px-md text-sm font-semibold text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none';

/**
 * The page for an address that does not exist: logo, a short friendly line and the main places to
 * go next. Never indexed. On the host, unknown paths also answer with HTTP 404 (docs/SEO.md).
 */
export default function NotFoundPage() {
  useDocumentTitle(SPECIAL_PAGES.notFound.title, SPECIAL_PAGES.notFound.description);
  return (
    <PageContainer className="py-2xl">
      <Card
        variant="dense"
        padding="lg"
        className="mx-auto flex max-w-xl flex-col items-center text-center"
      >
        <AlankarLogo className="h-16 w-16 text-primary" />
        <p className="mt-md text-sm font-semibold uppercase tracking-wide text-primary-hover">
          Error 404
        </p>
        <h1 className="mt-1 font-display text-3xl text-text">Page not found</h1>
        <p className="mt-sm max-w-[45ch] text-base text-text-muted">
          We looked everywhere at {brand.shopName}, but this page is not here. It may have moved, or
          the address has a small typo. These will take you somewhere useful:
        </p>
        <nav aria-label="Main pages" className="mt-lg w-full">
          <ul className="flex flex-wrap justify-center gap-sm">
            <li>
              <Link to="/" className={link}>
                Home
              </Link>
            </li>
            {divisions.map((d) => (
              <li key={d.id}>
                <Link to={d.path} className={link}>
                  {d.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/book" className={link}>
                Book
              </Link>
            </li>
          </ul>
        </nav>
        <div className="mt-lg flex flex-wrap justify-center gap-sm">
          <Button variant="secondary" onClick={openCommandBar}>
            <Search aria-hidden="true" className="h-4 w-4" /> Search the site
          </Button>
          <Button variant="secondary" onClick={openChat}>
            <MessageCircle aria-hidden="true" className="h-4 w-4" /> Ask our assistant
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}
