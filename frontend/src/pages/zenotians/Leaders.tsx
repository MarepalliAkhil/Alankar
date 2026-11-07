import type { Person } from '../../api/zenotians';
import { Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import { LABEL, initialsOf, leaderPhoto, slugOf } from './leaders-model';
import { Bullets, Ext } from './parts';

/** Themed initials: decorative (the name sits right beside it), so the alt text is empty. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      data-leader-avatar="monogram"
      aria-hidden="true"
      className={cn(
        'flex h-16 w-16 shrink-0 select-none items-center justify-center rounded-full border border-border bg-primary-soft text-xl font-semibold text-text',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

function Avatar({ person, photo }: { person: Person; photo: string | null }) {
  if (!photo) return <Monogram name={person.name} />;
  return (
    <figure className="flex shrink-0 flex-col items-start gap-1">
      <img
        data-leader-avatar="photo"
        src={photo}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className="h-16 w-16 rounded-full border border-border object-cover"
      />
      {person.photo_credit && (
        <figcaption className="max-w-[16ch] text-sm text-text-muted">
          {person.photo_credit}
        </figcaption>
      )}
    </figure>
  );
}

export function LeaderCard({ person }: { person: Person }) {
  const sources = (person.sources ?? []).filter(Boolean);
  return (
    <Card
      variant="dense"
      as="article"
      data-leader={slugOf(person.name)}
      className="flex h-full w-full flex-col gap-md"
    >
      <header className="flex items-center gap-md">
        <Avatar person={person} photo={leaderPhoto(person)} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-text">{person.name}</h3>
          <p className="text-text-muted">{person.title}</p>
        </div>
      </header>
      <Bullets items={person.bio} />
      {(sources.length > 0 || person.last_checked) && (
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
          {sources.map((url, i) => (
            <Ext key={url} href={url}>
              {sources.length > 1 ? `Source ${i + 1}` : 'Source'}
            </Ext>
          ))}
          {person.last_checked && <span>last checked: {person.last_checked}</span>}
        </p>
      )}
    </Card>
  );
}

/** One column on phones, two on tablets; on desktop the first card (the CEO) spans the full width. */
export function Leaders({ people }: { people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="zen-leaders" className="flex flex-col gap-md">
      <h2 id="zen-leaders" className="text-xl font-semibold text-text">
        Leadership
      </h2>
      <p className="text-sm text-text-muted">{LABEL}</p>
      <ul className="grid grid-cols-1 items-stretch gap-md sm:grid-cols-2">
        {people.map((p, i) => (
          <li key={p.name} className={cn('flex', i === 0 && 'lg:col-span-2')}>
            <LeaderCard person={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
