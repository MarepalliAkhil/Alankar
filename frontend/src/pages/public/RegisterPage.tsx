import { CircleCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { registerCustomer } from '../../api/auth';
import { registerErrorMessage } from '../../api/auth-messages';
import { OtpStep } from '../../components/auth/OtpStep';
import { serverFieldErrors } from '../../api/client';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  EmptyState,
  Input,
  PasswordInput,
} from '../../components/ui';
import { brand } from '../../config/brand';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { destinationAfterLogin } from '../../routes/destination';
import { useSession } from '../../session/session-context';
import { fieldErrors, normalisePhone } from '../../lib/validation';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name is too long.'),
    email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.'),
    phone: z
      .string()
      .transform(normalisePhone)
      .refine((value) => /^[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit mobile number.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Repeat your password.'),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the terms and cancellation policy.' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

type FieldName = 'name' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'consent';

/** Customers only. Staff accounts are created by admin invite (no sign-up for staff). */
export default function RegisterPage() {
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ email: string; detail: string } | null>(null);
  const navigate = useNavigate();
  const { completeOtp } = useSession();
  const [params] = useSearchParams();
  const next = params.get('next');
  const loginPath = `/login?role=customer${next ? `&next=${encodeURIComponent(next)}` : ''}`;

  useDocumentTitle('Create account');

  const update = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse({ ...values, consent });
    if (!parsed.success) {
      setErrors(fieldErrors<FieldName>(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { name, email, phone, password } = parsed.data;
      const result = await registerCustomer({
        full_name: name,
        email,
        phone,
        password,
        consent: true,
        marketing_opt_in: marketing,
      });
      if (result.otpRequired) setOtp({ email, detail: result.detail });
      else setDone(result.detail);
    } catch (error) {
      const fields = serverFieldErrors(error);
      setErrors({
        name: fields.full_name,
        email: fields.email,
        phone: fields.phone,
        password: fields.password,
        consent: fields.consent,
      });
      setFormError(registerErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (otp) {
    return (
      <PageContainer className="flex justify-center py-xl">
        <Card variant="dense" padding="lg" className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-text">Verify your email</h1>
          <p className="mb-lg mt-1 text-sm text-text-muted">
            One last step to finish creating your account.
          </p>
          <OtpStep
            email={otp.email}
            purpose="register"
            message={otp.detail}
            onVerify={async (code) => {
              const verified = await completeOtp(otp.email, code, 'register');
              navigate(destinationAfterLogin(verified, next, false), { replace: true });
            }}
            onBack={() => setOtp(null)}
          />
        </Card>
      </PageContainer>
    );
  }

  if (done) {
    return (
      <PageContainer className="flex justify-center py-xl">
        <Card variant="dense" padding="lg" className="w-full max-w-md">
          <EmptyState
            icon={<CircleCheck className="h-6 w-6" />}
            title="Almost there"
            description={done}
            action={<ButtonLink to={loginPath}>Sign in</ButtonLink>}
          />
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex justify-center py-xl">
      <Card variant="dense" padding="lg" className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-text">Create your account</h1>
        <p className="mt-1 text-sm text-text-muted">
          Register as a customer to book appointments at {brand.shopName}.
        </p>

        <form noValidate onSubmit={onSubmit} className="mt-lg flex flex-col gap-md">
          <Input
            label="Full name"
            name="name"
            autoComplete="name"
            required
            value={values.name}
            onChange={update('name')}
            error={errors.name}
          />
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={update('email')}
            error={errors.email}
          />
          <Input
            label="Mobile number"
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            hint="We'll use this to confirm your bookings."
            required
            value={values.phone}
            onChange={update('phone')}
            error={errors.phone}
          />
          <PasswordInput
            label="Password"
            name="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            required
            value={values.password}
            onChange={update('password')}
            error={errors.password}
          />
          <PasswordInput
            label="Confirm password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={values.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
          />
          <Checkbox
            name="consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            label="I agree to the terms, privacy notice and cancellation policy."
            error={errors.consent}
          />
          <Checkbox
            name="marketing"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
            label="Send me offers and news by email. I can unsubscribe any time (optional)."
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
            Create account
          </Button>
        </form>

        <p className="mt-lg text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link
            to={loginPath}
            className="font-medium text-primary-hover underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-sm text-center text-xs text-text-muted">
          Staff accounts are created by the salon admin. Staff sign in from the Login page.
        </p>
      </Card>
    </PageContainer>
  );
}
