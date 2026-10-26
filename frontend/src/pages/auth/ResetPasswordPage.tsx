import { CircleCheck, Link2Off } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '../../api/auth';
import { genericErrorMessage } from '../../api/auth-messages';
import { serverFieldErrors } from '../../api/client';
import { PageContainer } from '../../components/layout/PageContainer';
import { ButtonLink, Card, EmptyState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SetPasswordForm } from './SetPasswordForm';

export default function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
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
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
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
            <h1 className="text-2xl font-bold text-text">Choose a new password</h1>
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
