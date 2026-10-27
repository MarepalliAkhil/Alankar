import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { listThreads, type ThreadCard } from '../../api/chat';
import { PageHeader } from '../../components/layout/PageContainer';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';
import ConversationView from './ConversationView';

function PersonCard({ card, base }: { card: ThreadCard; base: string }) {
  return (
    <Link
      to={`${base}/${card.id}`}
      className="block rounded-card focus-visible:outline-2"
      aria-label={`Open conversation with ${card.other.name}${card.unread ? `, ${card.unread} unread` : ''}`}
    >
      <Card className="flex h-full items-start gap-md transition hover:shadow-lg">
        <div className="relative">
          <Avatar name={card.other.name} src={card.other.photo_url || undefined} size="lg" />
          {card.unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white"
            >
              {card.unread}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <div className="flex items-center justify-between gap-sm">
            <h3 className="truncate font-semibold text-text">{card.other.name}</h3>
            {!card.open && <Badge>Read-only</Badge>}
          </div>
          {card.other.title && <p className="text-xs text-text-muted">{card.other.title}</p>}
          {card.appointment && (
            <p className="w-fit rounded-full bg-primary-soft px-sm py-0.5 text-xs text-primary-hover">
              {card.appointment.service_name}
              {card.appointment.start ? ` · ${formatDateTime(card.appointment.start)}` : ''}
            </p>
          )}
          <p className="truncate text-sm text-text-muted">
            {card.last_message
              ? `${card.last_message.mine ? 'You: ' : ''}${card.last_message.preview}`
              : 'No messages yet. Say hello.'}
          </p>
        </div>
      </Card>
    </Link>
  );
}

/** Zen Chat: a grid of person cards; opening a card opens that conversation. */
export default function ChatPage({ base }: { base: '/chat' | '/customer/chat' }) {
  const { id } = useParams();
  useDocumentTitle('Chat');
  const threads = useQuery({
    queryKey: ['chat', 'threads'],
    queryFn: listThreads,
    refetchInterval: 15000,
    enabled: !id,
  });

  if (id) return <ConversationView id={id} base={base} />;
  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title={base === '/chat' ? 'Zen Chat' : 'Stylist Chat'}
        description={
          base === '/chat'
            ? 'Message the guests you have visits with. Only you and the guest can read a conversation.'
            : 'Message your stylist about a visit. Only you and your stylist can read a conversation.'
        }
      />
      {threads.isPending ? (
        <LoadingState label="Loading your conversations…" />
      ) : threads.isError ? (
        <ErrorState
          description="We couldn't load your conversations."
          onRetry={() => void threads.refetch()}
        />
      ) : threads.data.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="No conversations yet"
          description={
            base === '/chat'
              ? 'A conversation opens when a visit with you is scheduled.'
              : 'A conversation opens once your stylist is confirmed and your visit is paid and scheduled.'
          }
        />
      ) : (
        <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {threads.data.map((card) => (
            <li key={card.id}>
              <PersonCard card={card} base={base} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
