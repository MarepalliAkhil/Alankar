import { useQuery } from '@tanstack/react-query';
import { getPolicyPage, type PolicyKey } from '../../api/public';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { usePageHead } from '../../seo/head';
import { breadcrumbTrail } from '../../seo/seo-data.js';

const paths: Record<PolicyKey, string> = {
  privacy: '/privacy',
  terms: '/terms',
  cancellation: '/cancellation-policy',
};

const titles: Record<PolicyKey, string> = {
  privacy: 'Privacy notice',
  terms: 'Terms of service',
  cancellation: 'Cancellation policy',
};

/** Policy text from the database (edited by the admin). */
export default function PolicyPage({ policy }: { policy: PolicyKey }) {
  usePageHead(paths[policy]);
  const page = useQuery({ queryKey: ['policy', policy], queryFn: () => getPolicyPage(policy) });
  return (
    <PageContainer className="pb-xl">
      <PageHeader
        eyebrow="Policies"
        title={titles[policy]}
        breadcrumb={breadcrumbTrail(paths[policy]).map((crumb, index, all) => ({
          label: crumb.label,
          to: index < all.length - 1 ? crumb.path : undefined,
        }))}
      />
      <Card variant="dense" padding="lg" className="max-w-3xl">
        {page.isPending ? (
          <LoadingState />
        ) : page.isError ? (
          <ErrorState onRetry={() => void page.refetch()} />
        ) : page.data.body ? (
          <div className="flex flex-col gap-md text-base leading-relaxed text-text">
            {page.data.body.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <EmptyState
            title="This policy has not been published yet"
            description="Please contact the salon if you have a question."
          />
        )}
      </Card>
    </PageContainer>
  );
}
