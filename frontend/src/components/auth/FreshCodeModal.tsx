import { useEffect, useState, type FormEvent } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { startStepUp, verifyStepUp } from '../../api/trustedDevices';
import { Button, Input, Modal } from '../ui';

/**
 * Sensitive actions (change password, delete account, payment settings) always ask for a fresh
 * code, even on a remembered device. Opening this sends the code; a right code lets the action
 * go ahead.
 */
export function FreshCodeModal({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('Sending a code…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    startStepUp()
      .then((result) => {
        if (!live) return;
        if (!result.required) onVerified();
        else setMessage(result.detail ?? 'Enter the 6-digit code.');
      })
      .catch((failure) => {
        if (live) setError(genericErrorMessage(failure, "We couldn't send a code."));
      });
    return () => {
      live = false;
    };
    // The code is sent once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyStepUp(code.trim());
      onVerified();
    } catch (failure) {
      setError(genericErrorMessage(failure, 'That code is incorrect or has expired.'));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      busy={busy}
      onClose={onCancel}
      title="Enter a fresh code"
      description="For your security we ask for a new code before this, even on a device you trust."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form="fresh-code-form" loading={busy}>
            Continue
          </Button>
        </>
      }
    >
      <form id="fresh-code-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
        <p className="text-sm text-text-muted">{message}</p>
        <Input
          label="Code"
          name="fresh-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
          error={error || undefined}
        />
      </form>
    </Modal>
  );
}
