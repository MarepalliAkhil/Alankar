import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheck, Link2Off } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { acceptInvite, checkInvite } from '../../api/auth';
import { genericErrorMessage } from '../../api/auth-messages';
import { serverFieldErrors } from '../../api/client';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState, LoadingState } from '../../components/ui';
import { brand } from '../../config/brand';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { roleLabel } from '../../policy/policy';
import { SetPasswordForm } from './SetPasswordForm';

/** Staff invite link: set a password to activate the account (dev-only while email is simulated). */
export default function AcceptInvitePage() {
  useDocumentTitle('Join the team');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => checkInvite(token),
    enabled: token.length > 0,
    retry: false,
  });
  const accept = useMutation({ mutationFn: (password: string) => acceptInvite(token, password) });

  const invalid = (
    <EmptyState
      icon={<Link2Off className="h-6 w-6" />}
      title="This invite link is invalid or has expired"
      description="Ask your salon admin to send you a new invite."
      action={<ButtonLink to="/">Go to home</ButtonLink>}
    />
  );

  let content;
  if (!token) content = invalid;
  else if (invite.isPending) content = <LoadingState label="Checking your invite…" />;
  else if (invite.isError) content = invalid;
  else if (accept.isSuccess)
    content = (
      <EmptyState
        icon={<CircleCheck className="h-6 w-6" />}
        title="You're all set"
        description="Your password is saved. Sign in with your role tab."
        action={<ButtonLink to={`/login?role=${accept.data.role}`}>Sign in</ButtonLink>}
      />
    );
  else {
    const fields = accept.isError ? serverFieldErrors(accept.error) : {};
    content = (
      <>
        <h1 className="text-2xl font-semibold text-text">Welcome, {invite.data.full_name}</h1>
        <p className="mb-lg mt-1 text-sm text-text-muted">
          You&apos;ve been invited to {brand.shopName} as a{' '}
          {roleLabel(invite.data.role).toLowerCase()} ({invite.data.email}). Choose a password to
          activate your account.
        </p>
        <SetPasswordForm
          submitLabel="Activate my account"
          submitting={accept.isPending}
          serverPasswordError={fields.password}
          serverError={
            accept.isError && !fields.password
              ? genericErrorMessage(accept.error, 'This invite link is invalid or has expired.')
              : null
          }
          onSubmit={(password) => accept.mutate(password)}
        />
      </>
    );
  }

  return (
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        {content}
      </Card>
    </PageContainer>
  );
}
