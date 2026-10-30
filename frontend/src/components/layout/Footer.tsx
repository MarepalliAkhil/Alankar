import { Clock, MapPin, Phone } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { brand, poweredBy } from '../../config/brand';
import { useSite } from '../../hooks/useSite';

const policyPaths = {
  privacy: '/privacy',
  terms: '/terms',
  cancellation: '/cancellation-policy',
} as const;

/** Footer: contact, hours and policies from the database. */
export function Footer() {
  const year = new Date().getFullYear();
  const { data } = useSite();
  const onZenotians = useLocation().pathname.startsWith('/zenotians');
  const contact = data?.contact;
  const telephone = contact?.phone?.replace(/[^\d+]/g, '');

  return (
    <footer className="mt-2xl px-sm pb-lg sm:px-lg">
      <div
        data-scrolled="true"
        className="glass-bar mx-auto flex max-w-7xl flex-col gap-lg rounded-card px-lg py-lg"
      >
        {data && (
          <div className="grid gap-lg text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-sm">
              <h2 className="font-semibold text-text">Visit us</h2>
              {contact?.address && (
                <p className="flex gap-sm text-text-muted">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {contact.address}
                </p>
              )}
              {contact?.map_url && (
                <a
                  href={contact.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary-hover underline-offset-4 hover:underline"
                >
                  Open in Maps
                </a>
              )}
            </div>
            <div className="flex flex-col gap-sm">
              <h2 className="font-semibold text-text">Opening hours</h2>
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
              <h2 className="font-semibold text-text">Contact</h2>
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
                  className="text-primary-hover underline-offset-4 hover:underline"
                >
                  {contact.email}
                </a>
              )}
              {(data.social ?? []).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-hover underline-offset-4 hover:underline"
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
                className="underline-offset-4 hover:text-text hover:underline"
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
