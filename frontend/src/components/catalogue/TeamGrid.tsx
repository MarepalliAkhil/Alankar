import type { TeamMember } from '../../api/public';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

/** Public team profiles. Ratings appear only once real ratings exist (Task 6). */
export function TeamGrid({ team }: { team: readonly TeamMember[] }) {
  return (
    <ul className="card-grid">
      {team.map((member) => (
        <Card as="li" key={member.id} className="flex flex-col items-center gap-sm text-center">
          <Avatar name={member.display_name} src={member.photo_url || undefined} size="lg" />
          <div>
            <h3 className="font-semibold text-text">{member.display_name}</h3>
            <p className="text-sm text-primary-hover">{member.title}</p>
          </div>
          {member.specialization && (
            <p className="text-sm text-text-muted">{member.specialization}</p>
          )}
          <Badge tone="neutral">
            {member.rating === null ? 'No ratings yet' : `${member.rating.toFixed(1)} ★`}
          </Badge>
        </Card>
      ))}
    </ul>
  );
}
