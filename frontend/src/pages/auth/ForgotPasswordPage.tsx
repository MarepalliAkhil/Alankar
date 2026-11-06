import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { requestPasswordReset } from '../../api/auth';
import { genericErrorMessage } from '../../api/auth-messages';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, ButtonLink, Card, EmptyState, Input } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.'),
});

/** Customers reset their own password. Staff ask the admin. */
export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      setSent(await requestPasswordReset(parsed.data.email));
    } catch (err) {
      setFormError(
        genericErrorMessage(err, "We couldn't send the link right now. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        {sent ? (
          <EmptyState
            icon={<MailCheck className="h-6 w-6" />}
            title="Check your email"
            description={sent}
            action={
              <>
                {import.meta.env.DEV && (
                  <ButtonLink to="/dev/mailbox" variant="secondary">
                    Open dev mailbox
                  </ButtonLink>
                )}
                <ButtonLink to="/login?role=customer">Back to sign in</ButtonLink>
              </>
            }
          />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-text">Forgot your password?</h1>
            <p className="mt-1 text-sm text-text-muted">
              Enter the email of your customer account and we&apos;ll send you a reset link (valid
              for 1 hour).
            </p>
            <form noValidate onSubmit={onSubmit} className="mt-lg flex flex-col gap-md">
              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={error}
              />
              {formError && (
                <p
                  role="alert"
                  className="rounded-nested bg-danger-soft px-md py-sm text-sm text-danger-text"
                >
                  {formError}
                </p>
              )}
              <Button type="submit" fullWidth loading={submitting} loadingText="Sending…">
                Send reset link
              </Button>
            </form>
            <p className="mt-lg text-center text-sm text-text-muted">
              Staff member? Ask your salon admin to help you.{' '}
              <Link
                to="/login"
                className="font-medium text-primary-hover underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
