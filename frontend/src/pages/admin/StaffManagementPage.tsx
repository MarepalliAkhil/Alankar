import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, UserPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { genericErrorMessage } from '../../api/auth-messages';
import { serverFieldErrors } from '../../api/client';
import {
  createInvite,
  deactivateStaff,
  listAudit,
  listInvites,
  listStaff,
  reactivateStaff,
  type StaffMember,
  type StaffRole,
} from '../../api/staff';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Table,
  useToast,
  type BadgeTone,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { fieldErrors } from '../../lib/validation';
import { roleLabel } from '../../policy/policy';

const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter their full name.').max(80, 'Name is too long.'),
  email: z.string().trim().min(1, 'Enter their email.').email('Enter a valid email address.'),
  role: z.enum(['stylist', 'receptionist'], {
    errorMap: () => ({ message: 'Choose a role.' }),
  }),
});

type InviteField = 'full_name' | 'email' | 'role';

const statusTone: Record<StaffMember['status'], BadgeTone> = {
  active: 'success',
  invited: 'info',
  deactivated: 'danger',
};

const inviteTone = { pending: 'info', accepted: 'success', expired: 'neutral' } as const;

const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Admin: invite stylists and receptionists, and deactivate or reactivate their accounts. */
export default function StaffManagementPage() {
  useDocumentTitle('Staff');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: '', email: '', role: '' });
  const [errors, setErrors] = useState<Partial<Record<InviteField, string>>>({});
  const [confirming, setConfirming] = useState<StaffMember | null>(null);

  const staff = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const invites = useQuery({ queryKey: ['staff-invites'], queryFn: listInvites });
  const audit = useQuery({ queryKey: ['audit'], queryFn: listAudit });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['staff'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-invites'] });
    void queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const invite = useMutation({
    mutationFn: createInvite,
    onSuccess: (created) => {
      toast.show({
        tone: 'success',
        title: `Invite sent to ${created.email}`,
        description: import.meta.env.DEV
          ? 'Email is simulated: open the dev mailbox to see the link.'
          : 'They will get a link to set their password.',
      });
      setForm({ full_name: '', email: '', role: '' });
      refreshAll();
    },
    onError: (error) => {
      const fromServer = serverFieldErrors(error);
      setErrors(fromServer);
      if (Object.keys(fromServer).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Invite not sent',
          description: genericErrorMessage(error, 'Please try again.'),
        });
      }
    },
  });

  const toggle = useMutation({
    mutationFn: (member: StaffMember) =>
      member.status === 'active' ? deactivateStaff(member.id) : reactivateStaff(member.id),
    onSuccess: (member) => {
      toast.show({
        tone: 'success',
        title:
          member.status === 'active'
            ? `${member.full_name || member.email} can sign in again`
            : `${member.full_name || member.email} is deactivated`,
        description: member.status === 'active' ? undefined : 'Their sessions stopped immediately.',
      });
      setConfirming(null);
      refreshAll();
    },
    onError: (error) => {
      toast.show({
        tone: 'danger',
        title: 'Could not update the account',
        description: genericErrorMessage(error, 'Please try again.'),
      });
      setConfirming(null);
    },
  });

  const onInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = inviteSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors<InviteField>(parsed.error));
      return;
    }
    setErrors({});
    invite.mutate(parsed.data as { full_name: string; email: string; role: StaffRole });
  };

  const staffColumns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-text">{row.full_name || '—'}</p>
          <p className="text-xs text-text-muted">{row.email}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => roleLabel(row.role) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone[row.status]}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) =>
        row.status === 'invited' ? (
          <span className="text-xs text-text-muted">Waiting for the invite</span>
        ) : row.status === 'active' ? (
          <Button size="sm" variant="danger" onClick={() => setConfirming(row)}>
            Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={toggle.isPending && toggle.variables?.id === row.id}
            onClick={() => toggle.mutate(row)}
          >
            Reactivate
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Staff"
        description="Invite stylists and receptionists, and deactivate accounts. Staff profiles, skills and working hours arrive in Task 5."
        actions={
          import.meta.env.DEV ? (
            <Link
              to="/dev/mailbox"
              className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-primary-hover hover:bg-primary-soft"
            >
              <Mail aria-hidden="true" className="h-4 w-4" /> Dev mailbox
            </Link>
          ) : undefined
        }
      />

      <Card variant="dense" as="section" aria-labelledby="invite-title">
        <h2 id="invite-title" className="flex items-center gap-sm text-lg font-semibold text-text">
          <UserPlus aria-hidden="true" className="h-5 w-5 text-primary-hover" /> Invite a team
          member
        </h2>
        <form
          noValidate
          onSubmit={onInvite}
          className="mt-md grid gap-md md:grid-cols-4 md:items-start"
        >
          <Input
            label="Full name"
            name="full_name"
            required
            value={form.full_name}
            onChange={(event) => setForm((f) => ({ ...f, full_name: event.target.value }))}
            error={errors.full_name}
          />
          <Input
            label="Email"
            type="email"
            name="email"
            required
            value={form.email}
            onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
            error={errors.email}
          />
          <Select
            label="Role"
            name="role"
            required
            placeholder="Choose a role"
            options={[
              { value: 'stylist', label: 'Stylist' },
              { value: 'receptionist', label: 'Receptionist' },
            ]}
            value={form.role}
            onChange={(event) => setForm((f) => ({ ...f, role: event.target.value }))}
            error={errors.role}
          />
          <div className="md:pt-7">
            <Button type="submit" fullWidth loading={invite.isPending}>
              Send invite
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="team-title" className="flex flex-col gap-md">
        <h2 id="team-title" className="flex items-center gap-sm text-lg font-semibold text-text">
          <Users aria-hidden="true" className="h-5 w-5 text-primary-hover" /> Team
        </h2>
        {staff.isPending ? (
          <Card variant="dense">
            <LoadingState label="Loading staff…" />
          </Card>
        ) : staff.isError ? (
          <Card variant="dense">
            <ErrorState
              description="We couldn't load the team."
              onRetry={() => void staff.refetch()}
            />
          </Card>
        ) : staff.data.length === 0 ? (
          <Card variant="dense">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No staff yet"
              description="Invite your first stylist or receptionist above."
            />
          </Card>
        ) : (
          <Table
            caption="Staff accounts"
            columns={staffColumns}
            rows={staff.data}
            rowKey={(row) => row.id}
          />
        )}
      </section>

      <section aria-labelledby="invites-title" className="flex flex-col gap-md">
        <h2 id="invites-title" className="text-lg font-semibold text-text">
          Invites
        </h2>
        {invites.isPending ? (
          <Card variant="dense">
            <LoadingState label="Loading invites…" />
          </Card>
        ) : invites.isError ? (
          <Card variant="dense">
            <ErrorState
              description="We couldn't load the invites."
              onRetry={() => void invites.refetch()}
            />
          </Card>
        ) : (
          <Table
            caption="Staff invites"
            rows={invites.data}
            rowKey={(row) => row.id}
            emptyMessage="No invites sent yet."
            columns={[
              { key: 'email', header: 'Email', render: (row) => row.email },
              { key: 'role', header: 'Role', render: (row) => roleLabel(row.role) },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <Badge tone={inviteTone[row.status]}>{row.status}</Badge>,
              },
              { key: 'expires', header: 'Link expires', render: (row) => dateTime(row.expires_at) },
            ]}
          />
        )}
      </section>

      <section aria-labelledby="activity-title" className="flex flex-col gap-md">
        <h2 id="activity-title" className="text-lg font-semibold text-text">
          Recent security activity
        </h2>
        {audit.isPending ? (
          <Card variant="dense">
            <LoadingState label="Loading activity…" />
          </Card>
        ) : audit.isError ? (
          <Card variant="dense">
            <ErrorState
              description="We couldn't load the audit log."
              onRetry={() => void audit.refetch()}
            />
          </Card>
        ) : (
          <Table
            caption="Audit log"
            rows={audit.data.slice(0, 15)}
            rowKey={(row) => row.id}
            emptyMessage="No activity yet."
            columns={[
              { key: 'when', header: 'When', render: (row) => dateTime(row.created_at) },
              { key: 'action', header: 'Event', render: (row) => row.action.replace(/_/g, ' ') },
              {
                key: 'who',
                header: 'Account',
                render: (row) => row.email || row.actor_email || '—',
              },
              { key: 'by', header: 'By', render: (row) => row.actor_email ?? '—' },
            ]}
          />
        )}
      </section>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Deactivate this account?"
        description={
          confirming
            ? `${confirming.full_name || confirming.email} will be signed out everywhere and cannot sign in until you reactivate them.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={toggle.isPending}
              onClick={() => confirming && toggle.mutate(confirming)}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          Their history is kept. You can reactivate them at any time.
        </p>
      </Modal>
    </div>
  );
}
