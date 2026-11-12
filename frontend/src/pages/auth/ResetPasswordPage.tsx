import { CircleCheck, Link2Off } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '../../api/auth';
import { genericErrorMessage } from '../../api/auth-messages';
import { serverFieldErrors } from '../../api/client';
import { Breadcrumbs } from '../../components/layout/Breadcrumbs';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { usePageHead } from '../../seo/head';
import { SetPasswordForm } from './SetPasswordForm';

export default function ResetPasswordPage() {
  usePageHead('/reset-password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>();

  const submit = async (password: string) => {
    setSubmitting(true);
    setServerError(null);
    setPasswordError(undefined);
    try {
      setDone(await confirmPasswordReset(token, password));
    } catch (error) {
      const fields = serverFieldErrors(error);
      if (fields.password) setPasswordError(fields.password);
      else setServerError(genericErrorMessage(error, 'This reset link is invalid or has expired.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="flex flex-col items-center gap-md py-xl">
      <Breadcrumbs path="/reset-password" className="w-full max-w-md" />
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        {/* One H1 in every state (the form shows it visibly). */}
        {(!token || done) && <h1 className="sr-only">Choose a new password</h1>}
        {!token ? (
          <EmptyState
            icon={<Link2Off className="h-6 w-6" />}
            title="This reset link is incomplete"
            description="Open the full link from the email, or request a new one."
            action={<ButtonLink to="/forgot-password">Request a new link</ButtonLink>}
          />
        ) : done ? (
          <EmptyState
            icon={<CircleCheck className="h-6 w-6" />}
            title="Password changed"
            description={done}
            action={<ButtonLink to="/login?role=customer">Sign in</ButtonLink>}
          />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-text">Choose a new password</h1>
            <p className="mb-lg mt-1 text-sm text-text-muted">
              For your security, you&apos;ll be signed out on other devices.
            </p>
            <SetPasswordForm
              submitLabel="Save new password"
              submitting={submitting}
              serverError={serverError}
              serverPasswordError={passwordError}
              onSubmit={(password) => void submit(password)}
            />
          </>
        )}
      </Card>
    </PageContainer>
  );
}
