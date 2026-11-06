import { Compass } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <PageContainer className="py-2xl">
      <Card variant="dense" className="mx-auto max-w-xl">
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          action={<ButtonLink to="/">Go to home</ButtonLink>}
        />
      </Card>
    </PageContainer>
  );
}
