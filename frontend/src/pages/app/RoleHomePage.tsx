import { ArrowRight, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RatingPrompt } from '../../components/booking/RatingPrompt';
import { PageHeader } from '../../components/layout/PageContainer';
import { Badge, ButtonLink, Card } from '../../components/ui';
import { brand } from '../../config/brand';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { homeFor, menuFor, roleLabel } from '../../policy/policy';
import { useSession } from '../../session/session-context';

/**
 * Role home (customer dashboard, staff dashboard, stylist "My Day").
 * Real content in Task 1: who you are, and every menu item with what it does and when it
 * arrives. Live numbers for each role come with that role's task.
 */
export default function RoleHomePage() {
  const { user } = useSession();
  useDocumentTitle('Overview');
  if (!user) return null;
  const home = homeFor(user.role);
  const homeItem = menuFor(user.role).find((item) => item.path === home);
  const items = menuFor(user.role).filter((item) => item.path !== home);
  const firstName = user.full_name.split(' ')[0] || user.email;

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow={`${roleLabel(user.role)} · ${brand.shopName}`}
        title={`Welcome, ${firstName}`}
        description={homeItem?.description}
      />

      {user.role === 'customer' && <RatingPrompt />}

      {user.role === 'admin' && (
        <Card className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Build your team</h2>
            <p className="text-sm text-text-muted">
              Invite stylists and receptionists. They get a link to set their own password.
            </p>
          </div>
          <ButtonLink to="/staff" variant="primary">
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Invite staff
          </ButtonLink>
        </Card>
      )}

      <section aria-labelledby="menu-overview">
        <h2 id="menu-overview" className="text-xl font-bold text-text">
          Your menu
        </h2>
        <ul className="mt-md grid gap-md sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.path}
                className="group block h-full rounded-card focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Card className="flex h-full flex-col gap-sm transition-transform duration-base ease-brand group-hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-sm">
                    <h3 className="font-semibold text-text">{item.label}</h3>
                    {item.status === 'available' ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="neutral">{item.task}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-muted">{item.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-sm text-sm font-medium text-primary-hover">
                    Open <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
