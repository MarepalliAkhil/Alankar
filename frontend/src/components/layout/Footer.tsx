import { Clock, MapPin, Phone } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { brand, poweredBy } from '../../config/brand';
import { DEMO_LABELS, safeContact } from '../../config/contact';
import { divisions } from '../../config/divisions';
import { useSite } from '../../hooks/useSite';
import { ZEN_ROOT } from '../../seo/seo-data.js';

const policyPaths = {
  privacy: '/privacy',
  terms: '/terms',
  cancellation: '/cancellation-policy',
} as const;

/** Footer: contact, hours and policies from the database. */
export function Footer() {
  const year = new Date().getFullYear();
  const { data } = useSite();
  const onZenotians = useLocation().pathname.startsWith(ZEN_ROOT);
  // Placeholder details (demo data) are replaced by an honest label, never shown as real.
  const { contact, tel: telephone, notes } = safeContact(data?.contact);
  const explore = [
    { to: '/', label: 'Home' },
    ...divisions.map((d) => ({ to: d.path, label: d.label })),
    { to: '/book', label: 'Book an appointment' },
    { to: ZEN_ROOT, label: 'For Zenotians' },
    { to: '/login', label: 'Sign in to your account' },
    { to: '/register', label: 'Register as a customer' },
  ];

  return (
    <footer className="mt-2xl border-t border-border bg-surface-muted px-md pb-lg pt-xl sm:px-lg">
      <div className="mx-auto flex max-w-7xl flex-col gap-lg">
        <nav aria-label="Explore Alankar">
          <h2 className="font-display text-lg text-text">Explore</h2>
          <ul className="mt-sm flex flex-wrap gap-x-md gap-y-1 text-sm">
            {explore.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="touch-target inline-flex items-center text-text-muted underline-offset-4 hover:text-text hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {data && (
          <div className="grid gap-lg text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-sm">
              <h2 className="font-display text-lg text-text">Visit us</h2>
              {contact?.address && (
                <p className="flex gap-sm text-text-muted">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {contact.address}
                </p>
              )}
              {notes
                .filter((note) => note === DEMO_LABELS.address)
                .map((note) => (
                  <p key={note} className="text-text-muted">
                    {note}
                  </p>
                ))}
              {contact?.map_url && (
                <a
                  href={contact.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-target inline-flex items-center font-medium text-primary-hover underline-offset-4 hover:underline"
                >
                  Open in Maps
                </a>
              )}
            </div>
            <div className="flex flex-col gap-sm">
              <h2 className="font-display text-lg text-text">Opening hours</h2>
              {(data.hours ?? []).map((row) => (
                <p key={row.days} className="flex gap-sm text-text-muted">
                  <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {row.closed ? `${row.days}: Closed` : `${row.days}: ${row.open} – ${row.close}`}
                  </span>
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-sm">
              <h2 className="font-display text-lg text-text">Contact</h2>
              {contact?.phone && telephone && (
                <a
                  href={`tel:${telephone}`}
                  className="inline-flex w-fit items-center gap-sm rounded-full bg-primary px-md py-sm font-medium text-on-primary hover:bg-primary-hover"
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  Call {contact.phone}
                </a>
              )}
              {contact?.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="touch-target inline-flex items-center break-all text-primary-hover underline-offset-4 hover:underline"
                >
                  {contact.email}
                </a>
              )}
              {notes
                .filter((note) => note !== DEMO_LABELS.address)
                .map((note) => (
                  <p key={note} className="text-text-muted">
                    {note}
                  </p>
                ))}
              {(data.social ?? []).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-target inline-flex items-center text-primary-hover underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-sm border-t border-border pt-md text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.shopName} · {brand.shopTagline}
          </p>
          <nav aria-label="Policies" className="flex flex-wrap gap-md">
            {(data?.policies ?? []).map((policy) => (
              <Link
                key={policy.key}
                to={policyPaths[policy.key]}
                className="touch-target inline-flex items-center underline-offset-4 hover:text-text hover:underline"
              >
                {policy.title}
              </Link>
            ))}
          </nav>
          <p className="text-xs">{poweredBy}</p>
          {onZenotians && (
            <p className="text-xs">Independent portfolio project, not affiliated with Zenoti</p>
          )}
        </div>
      </div>
    </footer>
  );
}
