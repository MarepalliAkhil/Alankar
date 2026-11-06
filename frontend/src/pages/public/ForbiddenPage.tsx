import { ShieldAlert } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function ForbiddenPage() {
  useDocumentTitle('No access');
  return (
    <PageContainer className="py-2xl">
      <Card variant="dense" className="mx-auto max-w-xl">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="You don't have access to this page"
          description="This page isn't available for your account. If you think this is a mistake, sign in with the right account."
          action={
            <>
              <ButtonLink to="/">Go to home</ButtonLink>
              <ButtonLink to="/login" variant="secondary">
                Sign in
              </ButtonLink>
            </>
          }
        />
      </Card>
    </PageContainer>
  );
}
