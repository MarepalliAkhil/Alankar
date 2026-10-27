import { Link } from 'react-router-dom';
import { useSite } from '../../hooks/useSite';

/** Notices the admin has published. Nothing is drawn when there are none. */
export function AnnouncementBar() {
  const site = useSite();
  const items = site.data?.announcements ?? [];
  if (items.length === 0) return null;
  return (
    <aside aria-label="Announcements" className="bg-primary-soft text-center text-sm text-text">
      <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-md py-sm">
        {items.map((item) => (
          <li key={item.text}>
            {item.link.startsWith('/') ? (
              <Link
                to={item.link}
                className="font-medium text-primary-hover underline-offset-4 hover:underline"
              >
                {item.text}
              </Link>
            ) : (
              item.text
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
