import { PageHeader } from '../../components/layout/PageContainer';
import { Badge, Card } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { roleLabel } from '../../policy/policy';
import { useSession } from '../../session/session-context';
import { PasswordForm } from '../customer/ProfilePage';

/** Profile for receptionist, stylist and admin: who is signed in, and a way to change the password. */
export default function StaffProfilePage() {
  useDocumentTitle('Profile');
  const { user } = useSession();
  if (!user) return null;
  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader
        title="Profile"
        description="Your sign-in details. Staff accounts are created by the admin."
      />
      <div className="grid gap-lg lg:grid-cols-2">
        <Card variant="plain" padding="lg" as="section" aria-label="Your details" className="h-fit">
          <h2 className="text-lg font-semibold text-text">Your details</h2>
          <dl className="mt-md grid gap-sm text-sm">
            <div>
              <dt className="text-text-muted">Name</dt>
              <dd className="font-medium text-text">{user.full_name}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Email</dt>
              <dd className="font-medium text-text">{user.email}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Role</dt>
              <dd>
                <Badge tone="primary">{roleLabel(user.role)}</Badge>
              </dd>
            </div>
          </dl>
        </Card>
        <PasswordForm />
      </div>
    </section>
  );
}
