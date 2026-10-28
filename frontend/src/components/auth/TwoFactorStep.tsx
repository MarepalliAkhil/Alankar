import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { Button, Input } from '../ui';

interface TwoFactorStepProps {
  message: string;
  /** Checks the code; rejects when it is wrong, used already or too old. */
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
}

/** Second step for admins with two-step sign-in: an authenticator code or a backup code. */
export function TwoFactorStep({ message, onVerify, onBack }: TwoFactorStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = code.trim();
    if (clean.replace(/[\s-]/g, '').length < 6) {
      setError('Enter the 6-digit code from your app, or a backup code.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onVerify(clean);
    } catch (failure) {
      setError(genericErrorMessage(failure, 'That code is incorrect or has expired.'));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-md">
      <div className="flex items-start gap-sm rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover" />
        <p>{message}</p>
      </div>
      <Input
        label="Code from your app"
        name="two-factor"
        autoComplete="one-time-code"
        maxLength={11}
        required
        hint="Lost your phone? Type one of your backup codes instead."
        value={code}
        onChange={(event) => setCode(event.target.value)}
        error={error ?? undefined}
      />
      <Button type="submit" fullWidth loading={busy}>
        Verify and sign in
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}
