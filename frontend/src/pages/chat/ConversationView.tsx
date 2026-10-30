import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../api/chat';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Textarea,
} from '../../components/ui';
import { useChat } from '../../hooks/useChat';
import { formatDateTime, formatTime } from '../../lib/format';
import { ButtonLink } from '../../components/ui/ButtonLink';

function Ticks({ status }: { status: ChatMessage['status'] }) {
  if (status === 'read') {
    return <CheckCheck aria-label="Read" className="h-3.5 w-3.5 text-info-text" />;
  }
  if (status === 'delivered') {
    return <CheckCheck aria-label="Delivered" className="h-3.5 w-3.5 text-text-muted" />;
  }
  return <Check aria-label="Sent" className="h-3.5 w-3.5 text-text-muted" />;
}

function Bubble({ message }: { message: ChatMessage }) {
  return (
    <li className={message.mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          message.mine
            ? 'max-w-[80%] rounded-card bg-primary-soft px-md py-sm text-text'
            : 'max-w-[80%] rounded-card bg-surface px-md py-sm text-text'
        }
      >
        {/* Plain text only: React escapes it, and line breaks are kept. Never inner HTML. */}
        <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
        <p className="mt-1 flex items-center justify-end gap-xs text-xs text-text-muted">
          {message.service && <span>{message.service} ·</span>}
          <span>{formatTime(message.created_at)}</span>
          {message.mine &&
            (message.failed ? (
              <span className="text-danger-text">Not sent</span>
            ) : message.pending ? (
              <span>Sending…</span>
            ) : (
              <Ticks status={message.status} />
            ))}
        </p>
      </div>
    </li>
  );
}

export default function ConversationView({ id, base }: { id: string; base: string }) {
  const chat = useChat(id);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const card = chat.history?.thread;
  const open = chat.history?.open ?? true;
  const max = chat.history?.max_length ?? 1000;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chat.messages.length, chat.typing]);

  const unreadFromThem = chat.messages.some((m) => !m.mine && m.status !== 'read');
  const { read } = chat;
  useEffect(() => {
    if (unreadFromThem && chat.connection !== 'connecting') {
      read();
      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });
    }
  }, [unreadFromThem, chat.connection, read, queryClient]);

  if (chat.loadError && !chat.history) {
    return (
      <ErrorState
        title="This conversation is not available"
        description="It may not exist, or it is not yours to read."
        action={<ButtonLink to={base}>Back to conversations</ButtonLink>}
      />
    );
  }
  if (!chat.history) return <LoadingState label="Loading the conversation…" />;

  const submit = () => {
    const value = text.trim();
    if (!value || value.length > max || !open) return;
    setText('');
    void chat.send(value);
  };

  return (
    <section className="flex flex-col gap-md">
      <ButtonLink to={base} variant="ghost" size="sm" className="w-fit">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        All conversations
      </ButtonLink>
      <Card className="flex items-center gap-md">
        <Avatar name={card?.other.name ?? ''} src={card?.other.photo_url || undefined} />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text">{card?.other.name}</h1>
          {card?.appointment && (
            <p className="text-xs text-text-muted">
              {card.appointment.service_name}
              {card.appointment.start ? ` · ${formatDateTime(card.appointment.start)}` : ''}
            </p>
          )}
        </div>
        <Badge tone={chat.connection === 'live' ? 'success' : 'warning'}>
          {chat.connection === 'live'
            ? 'Live'
            : chat.connection === 'connecting'
              ? 'Connecting…'
              : 'Reconnecting…'}
        </Badge>
      </Card>

      <Card className="flex h-[55vh] flex-col gap-sm overflow-y-auto" aria-live="polite">
        {chat.messages.length === 0 ? (
          <p className="m-auto text-sm text-text-muted">No messages yet. Say hello.</p>
        ) : (
          <ul className="flex flex-col gap-sm" aria-label="Messages">
            {chat.messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </ul>
        )}
        {chat.typing && <p className="text-xs text-text-muted">{card?.other.name} is typing…</p>}
        <div ref={endRef} />
      </Card>

      {!open ? (
        <p className="rounded-nested bg-surface-muted px-md py-sm text-sm text-text">
          This conversation is read-only now: it closed 7 days after your last completed visit. It
          opens again when a new visit is scheduled.
        </p>
      ) : (
        <form
          className="flex flex-col gap-sm"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Textarea
            label="Message"
            value={text}
            maxLength={max}
            rows={2}
            onChange={(event) => {
              setText(event.target.value);
              chat.signalTyping(event.target.value.length > 0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            hint={`${text.length} of ${max}. Plain text only.`}
          />
          {chat.problem && (
            <p role="alert" className="text-sm text-danger-text">
              {chat.problem}
            </p>
          )}
          <div>
            <Button type="submit" disabled={!text.trim()}>
              Send
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
