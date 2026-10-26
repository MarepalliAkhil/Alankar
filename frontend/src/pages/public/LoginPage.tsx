import { Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { login } from '../../api/auth';
import { loginErrorMessage } from '../../api/auth-messages';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button, Card, Input, PasswordInput, TabPanel, Tabs } from '../../components/ui';
import { brand } from '../../config/brand';
import { isLoginRole, loginRoles, type LoginRole } from '../../config/roles';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { fieldErrors } from '../../lib/validation';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormErrors = Partial<Record<'email' | 'password', string>>;

export default function LoginPage() {
  const [params, setParams] = useSearchParams();
  const roleParam = params.get('role');
  const role: LoginRole = isLoginRole(roleParam) ? roleParam : 'customer';
  const bookingIntent = params.get('intent') === 'book';
  const roleLabel = loginRoles.find((item) => item.id === role)?.label ?? 'Customer';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useDocumentTitle('Login');

  const changeRole = (next: LoginRole) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('role', next);
        return updated;
      },
      { replace: true },
    );
    setErrors({});
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors<'email' | 'password'>(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login({ role, ...parsed.data });
      // Task 1: redirect to the role's home (customer: back to booking when intent=book).
    } catch (error) {
      setFormError(loginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-text">Sign in</h1>
        <p className="mt-1 text-sm text-text-muted">
          {bookingIntent
            ? 'Sign in to your customer account to book an appointment.'
            : `Welcome back to ${brand.shopName}. Choose who you are and sign in.`}
        </p>

        <Tabs
          className="mt-lg"
          items={loginRoles}
          value={role}
          onChange={changeRole}
          label="Sign in as"
          idPrefix="login"
        />

        <TabPanel idPrefix="login" id={role} className="mt-lg">
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-md">
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
            />
            <PasswordInput
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
            />
            {formError && (
              <p
                role="alert"
                className="rounded-nested bg-danger-soft px-md py-sm text-sm text-danger-text"
              >
                {formError}
              </p>
            )}
            <Button type="submit" fullWidth loading={submitting}>
              Sign in as {roleLabel}
            </Button>
          </form>

          {role === 'customer' ? (
            <p className="mt-lg text-center text-sm text-text-muted">
              New here?{' '}
              <Link
                to="/register"
                className="font-medium text-primary-hover underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          ) : (
            <p className="mt-lg flex items-start gap-sm rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover" />
              Staff accounts are created by the salon admin. If you can&apos;t sign in, ask your
              admin for an invite.
            </p>
          )}
        </TabPanel>
      </Card>
    </PageContainer>
  );
}
