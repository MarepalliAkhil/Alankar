import type { CustomerAppointment } from '../../api/booking';
import { rebookLink } from '../../api/booking';
import { formatDateTime } from '../../lib/format';
import { ButtonLink } from '../ui/ButtonLink';

/** The short sorry note shown when the salon could not keep its side: what happened, what
 * happens next, the nearest free times and a Book again button. The wording is the server's, so
 * it always matches the email and the bell notification. */
export function SorryNote({ appt }: { appt: CustomerAppointment }) {
  const note = appt.sorry_note;
  if (!note) return null;
  const base = appt.rebook ?? {
    service: appt.service_slug,
    variant: null,
    addons: [],
    start: appt.preferred_start,
  };
  const headingId = `sorry-${appt.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-sm rounded-nested bg-danger-soft px-md py-sm text-sm text-text"
    >
      <h4 id={headingId} className="font-semibold">
        {note.title}
      </h4>
      <p className="font-medium">{note.parts.apology}</p>
      <p>{note.parts.what}</p>
      <p>{note.parts.next}</p>
      {note.parts.money && <p>{note.parts.money}</p>}
      {note.nearest_slots.length > 0 ? (
        <div className="flex flex-col gap-xs">
          <p>Here are the nearest times that are free:</p>
          <ul className="flex flex-wrap gap-xs">
            {note.nearest_slots.map((slot) => (
              <li key={slot.start}>
                <ButtonLink
                  to={rebookLink({ ...base, start: slot.start })}
                  size="sm"
                  variant="secondary"
                >
                  {formatDateTime(slot.start)}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>You can book again at any time.</p>
      )}
      <div className="flex flex-wrap items-center gap-sm">
        <ButtonLink to={rebookLink(base)} size="sm" className="w-fit">
          Book again
        </ButtonLink>
        {note.phone ? (
          <a
            className="text-sm font-medium text-primary-hover underline"
            href={`tel:${note.phone.replace(/[^+\d]/g, '')}`}
          >
            Call us on {note.phone}
          </a>
        ) : (
          <span className="text-text-muted">You can also contact our front desk.</span>
        )}
      </div>
    </section>
  );
}
