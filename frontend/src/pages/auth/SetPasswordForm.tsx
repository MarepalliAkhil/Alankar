import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button, PasswordInput } from '../../components/ui';
import { fieldErrors } from '../../lib/validation';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Repeat your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

type Field = 'password' | 'confirmPassword';

export interface SetPasswordFormProps {
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  serverPasswordError?: string;
  onSubmit: (password: string) => void;
}

/** New password + confirmation, shared by password reset and invite acceptance. */
export function SetPasswordForm({
  submitLabel,
  submitting,
  serverError,
  serverPasswordError,
  onSubmit,
}: SetPasswordFormProps) {
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const handle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(parsed.data.password);
  };

  return (
    <form noValidate onSubmit={handle} className="flex flex-col gap-md">
      <PasswordInput
        label="New password"
        name="password"
        autoComplete="new-password"
        hint="At least 8 characters, not too common."
        required
        value={values.password}
        onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        error={errors.password ?? serverPasswordError}
      />
      <PasswordInput
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        value={values.confirmPassword}
        onChange={(event) => setValues((v) => ({ ...v, confirmPassword: event.target.value }))}
        error={errors.confirmPassword}
      />
      {serverError && (
        <p
          role="alert"
          className="rounded-nested bg-danger-soft px-md py-sm text-sm text-danger-text"
        >
          {serverError}
        </p>
      )}
      <Button type="submit" fullWidth loading={submitting} loadingText="Saving…">
        {submitLabel}
      </Button>
    </form>
  );
}
