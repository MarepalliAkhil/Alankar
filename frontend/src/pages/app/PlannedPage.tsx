import { Hammer } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { MenuItem } from '../../policy/policy';

/**
 * TEMPORARY (owner-approved in Task 1): a menu item whose feature is built in a later task.
 * Shows what the page will do and when it arrives. Remove it as each task is built.
 */
export default function PlannedPage({ item, homePath }: { item: MenuItem; homePath: string }) {
  useDocumentTitle(item.label);
  return (
    <div data-planned-page={item.id}>
      <PageHeader eyebrow={`Arrives in ${item.task}`} title={item.label} />
      <Card variant="dense">
        <EmptyState
          icon={<Hammer className="h-6 w-6" />}
          title={`${item.label} arrives in ${item.task}`}
          description={item.description}
          action={
            <ButtonLink to={homePath} variant="secondary">
              Back to overview
            </ButtonLink>
          }
        />
      </Card>
    </div>
  );
}
