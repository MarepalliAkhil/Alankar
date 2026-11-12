import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { breadcrumbTrail } from '../../seo/seo-data.js';

/**
 * The visible trail for a page below the top level (Home / Sign in / Forgot password). The same
 * trail is in the page's BreadcrumbList structured data (src/seo/seo-data.js).
 */
export function Breadcrumbs({ path, className }: { path: string; className?: string }) {
  const trail = breadcrumbTrail(path);
  if (trail.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <Fragment key={crumb.path}>
              {index > 0 && (
                <li aria-hidden="true" className="px-0.5">
                  /
                </li>
              )}
              <li>
                {last ? (
                  <span aria-current="page" className="text-text">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.path}
                    className="touch-target inline-flex items-center rounded-full underline-offset-4 hover:text-text hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
