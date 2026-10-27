import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { errorDetail } from '../../api/client';
import { unsubscribe } from '../../api/marketing';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, ButtonLink, Card } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** The link at the bottom of every marketing email. No sign-in needed. */
export default function UnsubscribePage() {
  useDocumentTitle('Unsubscribe');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const stop = useMutation({ mutationFn: () => unsubscribe(token) });
  return (
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-text">Stop offers by email</h1>
        {!token ? (
          <p role="alert" className="mt-md text-sm text-danger-text">
            This link is not complete. Open the link from the email again.
          </p>
        ) : stop.isSuccess ? (
          <>
            <p role="status" className="mt-md text-sm text-text">
              {stop.data.detail}
            </p>
            <ButtonLink to="/" variant="secondary" className="mt-md">
              Back to the home page
            </ButtonLink>
          </>
        ) : (
          <>
            <p className="mt-md text-sm text-text-muted">
              We will stop sending you offers and news. Booking and receipt emails are not affected.
            </p>
            {stop.isError && (
              <p role="alert" className="mt-sm text-sm text-danger-text">
                {errorDetail(stop.error) ?? 'Something went wrong. Please try again.'}
              </p>
            )}
            <Button
              type="button"
              className="mt-md"
              loading={stop.isPending}
              onClick={() => stop.mutate()}
            >
              Unsubscribe me
            </Button>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
