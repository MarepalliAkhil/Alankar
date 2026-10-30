import { Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { needsOtp, needsTwoFactor, type OtpPurpose } from '../../api/auth';
import { loginErrorMessage } from '../../api/auth-messages';
import { OtpStep } from '../../components/auth/OtpStep';
import { TwoFactorStep } from '../../components/auth/TwoFactorStep';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  Button,
  ButtonLink,
  Card,
  PendingArea,
  Input,
  PasswordInput,
  TabPanel,
  Tabs,
} from '../../components/ui';
import { brand } from '../../config/brand';
import { isLoginRole, loginRoles, type LoginRole } from '../../config/roles';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { fieldErrors } from '../../lib/validation';
import { roleLabel } from '../../policy/policy';
import { destinationAfterLogin } from '../../routes/destination';
import { useSession } from '../../session/session-context';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormErrors = Partial<Record<'email' | 'password', string>>;

export default function LoginPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { status, user, signIn, completeOtp, completeTwoFactor, signOut } = useSession();
  const roleParam = params.get('role');
  const role: LoginRole = isLoginRole(roleParam) ? roleParam : 'customer';
  const bookingIntent = params.get('intent') === 'book';
  const signedOutIdle = params.get('reason') === 'idle';
  const roleText = loginRoles.find((item) => item.id === role)?.label ?? 'Customer';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState<{ email: string; detail: string; purpose: OtpPurpose } | null>(
    null,
  );

  const [twoFactor, setTwoFactor] = useState<{ challenge: string; detail: string } | null>(null);

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
      const result = await signIn({ role, ...parsed.data });
      if (needsTwoFactor(result)) {
        setTwoFactor({ challenge: result.challenge, detail: result.detail });
        setPassword('');
        setSubmitting(false);
        return;
      }
      if (needsOtp(result)) {
        setOtp({ email: result.email, detail: result.detail, purpose: result.purpose });
        setPassword('');
        setSubmitting(false);
        return;
      }
      navigate(destinationAfterLogin(result, params.get('next'), bookingIntent), {
        replace: true,
      });
    } catch (error) {
      setFormError(loginErrorMessage(error));
      setPassword('');
      setSubmitting(false);
    }
  };

  const verifyCode = async (code: string) => {
    if (!otp) return;
    setSubmitting(true); // keeps the "already signed in" panel from flashing
    try {
      const verified = await completeOtp(otp.email, code, otp.purpose);
      navigate(destinationAfterLogin(verified, params.get('next'), bookingIntent), {
        replace: true,
      });
    } catch (error) {
      setSubmitting(false);
      throw error;
    }
  };

  const verifyAppCode = async (code: string) => {
    if (!twoFactor) return;
    setSubmitting(true);
    try {
      const verified = await completeTwoFactor(twoFactor.challenge, code);
      navigate(destinationAfterLogin(verified, params.get('next'), bookingIntent), {
        replace: true,
      });
    } catch (error) {
      setSubmitting(false);
      throw error;
    }
  };

  if (status === 'authenticated' && user && !submitting) {
    return (
      <PageContainer className="flex justify-center py-xl">
        <Card variant="dense" padding="lg" className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-text">You&apos;re signed in</h1>
          <p className="mt-1 text-sm text-text-muted">
            Signed in as {user.full_name || user.email} ({roleLabel(user.role)}).
          </p>
          <div className="mt-lg flex flex-wrap justify-center gap-sm">
            <ButtonLink to={user.home}>
              Go to my {user.role === 'customer' ? 'account' : 'dashboard'}
            </ButtonLink>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex justify-center py-xl">
      <PendingArea
        pending={submitting}
        message="Signing you in. Please wait…"
        className="w-full max-w-md"
      >
        <Card variant="dense" padding="lg" className="w-full">
          <h1 className="text-2xl font-semibold text-text">Sign in</h1>
          <p className="mt-1 text-sm text-text-muted">
            {bookingIntent
              ? 'Sign in to your customer account to book an appointment.'
              : `Welcome back to ${brand.shopName}. Choose who you are and sign in.`}
          </p>

          {twoFactor ? (
            <div className="mt-lg">
              <TwoFactorStep
                message={twoFactor.detail}
                onVerify={verifyAppCode}
                onBack={() => setTwoFactor(null)}
              />
            </div>
          ) : otp ? (
            <div className="mt-lg">
              <OtpStep
                email={otp.email}
                purpose={otp.purpose}
                message={otp.detail}
                onVerify={verifyCode}
                onBack={() => setOtp(null)}
              />
            </div>
          ) : (
            <>
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
                  {signedOutIdle && !formError && (
                    <p
                      role="status"
                      className="rounded-nested bg-primary-soft px-md py-sm text-sm text-text"
                    >
                      You were signed out after 15 minutes without activity. Please sign in again.
                    </p>
                  )}
                  {formError && (
                    <p
                      role="alert"
                      className="rounded-nested bg-danger-soft px-md py-sm text-sm text-danger-text"
                    >
                      {formError}
                    </p>
                  )}
                  <Button type="submit" fullWidth loading={submitting} loadingText="Signing in…">
                    Sign in as {roleText}
                  </Button>
                </form>

                {role === 'customer' ? (
                  <div className="mt-lg flex flex-col items-center gap-sm text-sm text-text-muted">
                    <Link
                      to="/forgot-password"
                      className="font-medium text-primary-hover underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                    <p>
                      New here?{' '}
                      <Link
                        to={
                          params.get('next')
                            ? `/register?next=${encodeURIComponent(params.get('next') ?? '')}`
                            : '/register'
                        }
                        className="font-medium text-primary-hover underline-offset-4 hover:underline"
                      >
                        Create an account
                      </Link>
                    </p>
                  </div>
                ) : (
                  <p className="mt-lg flex items-start gap-sm rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover"
                    />
                    Staff accounts are created by the salon admin. If you can&apos;t sign in or
                    forgot your password, ask your admin.
                  </p>
                )}
              </TabPanel>
            </>
          )}
        </Card>
      </PendingArea>
    </PageContainer>
  );
}
