import { FileClock } from 'lucide-react';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { brand } from '../../config/brand';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/**
 * "For Zenotians" page. The ONE allowed content-pending page (MASTER_NOTES section 33):
 * the owner supplies the content later and it becomes admin-editable.
 */
export default function ZenotiansPage() {
  useDocumentTitle('For Zenotians');
  return (
    <PageContainer>
      <PageHeader
        eyebrow="For Zenotians"
        title={brand.platformName}
        description={brand.platformTagline}
      />
      <Card as="section" variant="dense" aria-label="Page content" data-content-pending="true">
        <EmptyState
          icon={<FileClock className="h-6 w-6" />}
          title="Content on its way"
          description="This page is being prepared by the owner and will be published here soon."
          action={
            <ButtonLink to="/" variant="secondary">
              Back to home
            </ButtonLink>
          }
        />
      </Card>
    </PageContainer>
  );
}
