import { useQuery } from '@tanstack/react-query';
import { Inbox, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listMailbox, type OutboxMessage } from '../../api/dev';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const kindLabel: Record<OutboxMessage['kind'], string> = {
  invite: 'Staff invite',
  password_reset: 'Password reset',
  notice: 'Notice',
};

function appPath(link: string): string | null {
  try {
    const url = new URL(link);
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/** Development only: simulated emails (the server answers 404 unless SALON_DEBUG=true). */
export default function MailboxPage() {
  useDocumentTitle('Dev mailbox');
  const mailbox = useQuery({ queryKey: ['dev-mailbox'], queryFn: listMailbox, retry: false });

  return (
    <PageContainer className="pb-xl">
      <PageHeader
        eyebrow="Development only"
        title="Dev mailbox"
        description="Emails are simulated in v1. Invites, password resets and notices appear here instead of being sent."
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void mailbox.refetch()}
          >
            Refresh
          </Button>
        }
      />
      {mailbox.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading mailbox…" />
        </Card>
      ) : mailbox.isError ? (
        <Card variant="dense">
          <ErrorState
            title="Mailbox unavailable"
            description="The dev mailbox only works when the API runs with SALON_DEBUG=true."
            onRetry={() => void mailbox.refetch()}
          />
        </Card>
      ) : mailbox.data.length === 0 ? (
        <Card variant="dense">
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="No emails yet"
            description="Invite a staff member or request a password reset to see an email here."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-md">
          {mailbox.data.map((message) => {
            const path = message.link ? appPath(message.link) : null;
            return (
              <Card as="li" key={message.id} variant="dense" className="flex flex-col gap-sm">
                <div className="flex flex-wrap items-center gap-sm">
                  <Badge tone="primary">{kindLabel[message.kind]}</Badge>
                  <span className="text-xs text-text-muted">
                    {new Date(message.created_at).toLocaleString('en-IN')}
                  </span>
                </div>
                <h2 className="font-semibold text-text">{message.subject}</h2>
                <p className="text-xs text-text-muted">To: {message.to_email}</p>
                <p className="text-sm text-text">{message.body}</p>
                {path && (
                  <Link
                    to={path}
                    className="self-start text-sm font-medium text-primary-hover underline-offset-4 hover:underline"
                  >
                    Open link
                  </Link>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
