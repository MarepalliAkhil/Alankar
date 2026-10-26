import { Sparkles } from 'lucide-react';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { getDivision, type DivisionId } from '../../config/divisions';
import { BOOK_NOW_PATH } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/**
 * Division page shell. The service grid, filters and booking sheet are built in Task 2
 * from the database catalogue; until then this shows the honest empty state.
 */
export default function DivisionPage({ divisionId }: { divisionId: DivisionId }) {
  const division = getDivision(divisionId);
  useDocumentTitle(division.label);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Services"
        title={division.label}
        description={division.summary}
        actions={<ButtonLink to={BOOK_NOW_PATH}>Book Now</ButtonLink>}
      />
      <Card as="section" variant="dense" aria-label={`${division.label} services`}>
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="No services listed yet"
          description={`${division.label} services will appear here as soon as the salon publishes them.`}
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
