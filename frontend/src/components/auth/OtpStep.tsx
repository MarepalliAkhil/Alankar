import { MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { resendOtp, type OtpPurpose } from '../../api/auth';
import { usePendingAction } from '../../hooks/usePendingAction';
import { genericErrorMessage } from '../../api/auth-messages';
import { Button, Input } from '../ui';

const RESEND_SECONDS = 60;

interface OtpStepProps {
  email: string;
  purpose: OtpPurpose;
  /** Message from the server, e.g. "We emailed a 6-digit code…". */
  message: string;
  /** Checks the code; rejects when it is wrong or expired. */
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
}

/** Second step for customers: type the 6-digit code that was emailed. */
export function OtpStep({ email, purpose, message, onVerify, onBack }: OtpStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onVerify(code);
    } catch (failure) {
      setError(genericErrorMessage(failure, 'That code is incorrect or has expired.'));
      setCode('');
      setBusy(false);
    }
  };

  const [resend, resending] = usePendingAction(async () => {
    setError(null);
    setInfo(null);
    try {
      setInfo(await resendOtp(email, purpose));
      setCooldown(RESEND_SECONDS);
    } catch (failure) {
      setError(genericErrorMessage(failure, "We couldn't send a new code. Please try again."));
    }
  });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-md">
      <div className="flex items-start gap-sm rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
        <MailCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover" />
        <p>{message}</p>
      </div>
      <Input
        label="6-digit code"
        name="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        error={error ?? undefined}
      />
      {info && <p className="text-sm text-text-muted">{info}</p>}
      <Button type="submit" fullWidth loading={busy} loadingText="Checking…">
        Verify and continue
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={cooldown > 0}
          loading={resending}
          loadingText="Sending…"
          onClick={() => void resend()}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>
    </form>
  );
}
