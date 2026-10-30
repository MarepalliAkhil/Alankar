import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import {
  confirmTwoFactor,
  disableTwoFactor,
  getTwoFactor,
  newBackupCodes,
  resetAdminTwoFactor,
  startTwoFactor,
  type OtherAdmin,
  type TwoFactorSetup,
} from '../../../api/twofactor';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PasswordInput,
  useToast,
} from '../../ui';
import { QrImage } from './QrImage';

/** Admin: two-step sign-in for my own account, and recovery for another admin. */
export function TwoFactorPanel() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['two-factor'], queryFn: getTwoFactor });
  const [dialog, setDialog] = useState<'setup' | 'disable' | 'codes' | null>(null);
  const [resetting, setResetting] = useState<OtherAdmin | null>(null);
  const [shown, setShown] = useState<string[] | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['two-factor'] });
  return (
    <div className="flex flex-col gap-md">
      <Card variant="dense" as="section" aria-label="Two-step sign-in">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div>
            <h2 className="text-lg font-semibold text-text">Two-step sign-in</h2>
            <p className="mt-1 text-sm text-text-muted">
              Once on, signing in needs your password and a 6-digit code from an authenticator app
              on your phone. It is optional and only for admin accounts.
            </p>
          </div>
          {status.data && (
            <Badge tone={status.data.enabled ? 'success' : 'neutral'}>
              {status.data.enabled ? 'On' : 'Off'}
            </Badge>
          )}
        </div>
        <div className="mt-md">
          {status.isPending ? (
            <LoadingState label="Loading…" />
          ) : status.isError ? (
            <ErrorState
              description="We couldn't load your two-step settings."
              onRetry={() => void status.refetch()}
            />
          ) : status.data.enabled ? (
            <div className="flex flex-col gap-sm">
              <p className="text-sm text-text">
                {status.data.backup_codes_left} backup code
                {status.data.backup_codes_left === 1 ? '' : 's'} left.
              </p>
              <div className="flex flex-wrap gap-sm">
                <Button type="button" variant="secondary" onClick={() => setDialog('codes')}>
                  Make new backup codes
                </Button>
                <Button type="button" variant="danger" onClick={() => setDialog('disable')}>
                  Turn off
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={() => setDialog('setup')}>
              <ShieldCheck className="size-4" aria-hidden /> Set up two-step sign-in
            </Button>
          )}
        </div>
      </Card>

      {status.data && (
        <Card variant="dense" as="section" aria-label="Other admins">
          <h2 className="text-lg font-semibold text-text">Other admins</h2>
          <p className="mt-1 text-sm text-text-muted">
            If an admin lost their phone and backup codes, another admin can switch two-step sign-in
            off for them. They are signed out, emailed, and it is recorded in the audit log.
          </p>
          {status.data.admins.length === 0 ? (
            <p className="mt-sm text-sm text-text-muted">There are no other admins.</p>
          ) : (
            <ul className="mt-sm flex flex-col gap-sm">
              {status.data.admins.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-nested border border-border p-md"
                >
                  <div>
                    <p className="font-medium text-text">{a.name}</p>
                    <p className="text-xs text-text-muted">{a.email}</p>
                  </div>
                  <div className="flex items-center gap-sm">
                    <Badge tone={a.two_factor ? 'success' : 'neutral'}>
                      {a.two_factor ? 'Two-step on' : 'Two-step off'}
                    </Badge>
                    {a.two_factor && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setResetting(a)}
                      >
                        Reset…
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {dialog === 'setup' && (
        <SetupDialog
          onClose={() => setDialog(null)}
          onDone={(codes) => {
            setDialog(null);
            setShown(codes);
            refresh();
          }}
        />
      )}
      {dialog === 'disable' && (
        <ProofDialog
          title="Turn off two-step sign-in"
          action="Turn off"
          run={disableTwoFactor}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog === 'codes' && (
        <ProofDialog
          title="Make new backup codes"
          action="Make new codes"
          run={async (password, code) =>
            setShown((await newBackupCodes(password, code)).backup_codes)
          }
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {shown && <CodesDialog codes={shown} onClose={() => setShown(null)} />}
      {resetting && (
        <ResetDialog
          admin={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SetupDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (codes: string[]) => void;
}) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');
  const start = useQuery<TwoFactorSetup>({
    queryKey: ['two-factor-setup'],
    queryFn: startTwoFactor,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const confirm = useMutation({
    mutationFn: () => confirmTwoFactor(code.trim()),
    onSuccess: (r) => onDone(r.backup_codes),
    onError: (error) =>
      setProblem(serverFieldErrors(error).code ?? errorDetail(error) ?? 'That code did not work.'),
  });
  return (
    <Modal
      busy={confirm.isPending}
      open
      onClose={onClose}
      title="Set up two-step sign-in"
      size="md"
    >
      {start.isPending ? (
        <LoadingState label="Preparing…" />
      ) : start.isError ? (
        <ErrorState
          description={errorDetail(start.error) ?? "We couldn't start the set-up."}
          onRetry={() => void start.refetch()}
        />
      ) : (
        <form
          noValidate
          className="flex flex-col gap-md"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setProblem('');
            confirm.mutate();
          }}
        >
          <ol className="list-decimal pl-5 text-sm text-text">
            <li>Open an authenticator app on your phone and add an account.</li>
            <li>Scan this picture, or type the key below into the app.</li>
            <li>Type the 6-digit code the app shows, then press Turn on.</li>
          </ol>
          <div className="flex flex-col items-center gap-sm">
            <QrImage rows={start.data.qr} label="QR code for your authenticator app" />
            <p className="text-xs text-text-muted">Key to type in by hand</p>
            <p className="font-mono text-sm break-all text-text">{start.data.secret}</p>
          </div>
          <Input
            label="6-digit code"
            name="two-factor-confirm"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            error={problem || undefined}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <div className="flex gap-sm">
            <Button type="submit" loading={confirm.isPending}>
              Turn on
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.show({ tone: 'success', title: 'Codes copied' });
    } catch {
      toast.show({ tone: 'danger', title: 'Could not copy. Write them down instead.' });
    }
  };
  return (
    <Modal open onClose={onClose} title="Your backup codes" size="sm">
      <p className="text-sm text-text">
        Keep these somewhere safe. Each one signs you in once if you lose your phone. They are shown
        only now.
      </p>
      <ul aria-label="Backup codes" className="mt-sm grid grid-cols-2 gap-xs font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded-nested bg-primary-soft px-sm py-xs text-text">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-md flex gap-sm">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden /> Copy
        </Button>
        <Button type="button" onClick={onClose}>
          I have saved them
        </Button>
      </div>
    </Modal>
  );
}

function ProofDialog({
  title,
  action,
  run,
  onClose,
  onDone,
}: {
  title: string;
  action: string;
  run: (password: string, code: string) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const go = useMutation({
    mutationFn: () => run(password, code.trim()),
    onSuccess: onDone,
    onError: (error) => {
      setFields(serverFieldErrors(error));
      setProblem(errorDetail(error) ?? '');
    },
  });
  return (
    <Modal busy={go.isPending} open onClose={onClose} title={title} size="sm">
      <form
        noValidate
        className="flex flex-col gap-md"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setFields({});
          setProblem('');
          go.mutate();
        }}
      >
        <p className="text-sm text-text">
          Confirm it is you with your password and a current code.
        </p>
        <PasswordInput
          label="Password"
          name="proof-password"
          autoComplete="current-password"
          value={password}
          error={fields.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Code from your app"
          name="proof-code"
          autoComplete="one-time-code"
          maxLength={11}
          value={code}
          error={fields.code}
          onChange={(e) => setCode(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={go.isPending}>
            {action}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetDialog({
  admin,
  onClose,
  onDone,
}: {
  admin: OtherAdmin;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const go = useMutation({
    mutationFn: () => resetAdminTwoFactor(admin.id, reason.trim()),
    onSuccess: () => {
      toast.show({ tone: 'success', title: `Two-step sign-in reset for ${admin.name}` });
      onDone();
    },
    onError: (error) =>
      setProblem(serverFieldErrors(error).reason ?? errorDetail(error) ?? 'Could not reset it.'),
  });
  return (
    <Modal
      busy={go.isPending}
      open
      onClose={onClose}
      title={`Reset two-step sign-in for ${admin.name}`}
      size="sm"
    >
      <form
        noValidate
        className="flex flex-col gap-md"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setProblem('');
          go.mutate();
        }}
      >
        <p className="text-sm text-text">
          {admin.name} will be signed out and emailed. They can sign in with their password and
          switch two-step sign-in on again.
        </p>
        <Input
          label="Why? (kept in the audit log)"
          value={reason}
          maxLength={300}
          error={problem || undefined}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-sm">
          <Button type="submit" variant="danger" loading={go.isPending}>
            Reset
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
