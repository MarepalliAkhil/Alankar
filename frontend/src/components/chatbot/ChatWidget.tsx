import { MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { askChatbot, type ChatAction, type ChatReply } from '../../api/chatbot';
import { cn } from '../../lib/cn';
import { useSession } from '../../session/session-context';
import { Spinner } from '../ui/Spinner';

export const CHATBOT_NAME = 'AI Alankar Intelligence';
const MAX_LENGTH = 500;

interface Message {
  id: number;
  from: 'bot' | 'you';
  text: string;
  reply?: ChatReply;
}

const WELCOME: Message = {
  id: 0,
  from: 'bot',
  text: "Hello! I'm AI Alankar Intelligence. I can help with services and prices, booking and payment, cancellations, and your appointments.",
  reply: {
    text: '',
    intent: 'greeting',
    rephrased: '',
    show_rephrase: false,
    actions: [],
    suggestions: ['How do I book an appointment?', 'Our services', 'Opening hours'],
    needs_login: false,
    source: 'intent',
  },
};

function ActionLink({ action, onNavigate }: { action: ChatAction; onNavigate: () => void }) {
  const className =
    'inline-flex items-center rounded-full border border-border bg-surface px-md py-xs text-sm font-medium text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none';
  if (action.url.startsWith('/')) {
    return (
      <Link to={action.url} className={className} onClick={onNavigate}>
        {action.label}
      </Link>
    );
  }
  // tel: links only; the server never sends anything else.
  return (
    <a href={action.url} className={className}>
      {action.label}
    </a>
  );
}

/**
 * The floating "AI Alankar Intelligence" assistant. Only for guests and customers: it is not
 * rendered for staff accounts, and the server refuses their questions as well.
 */
export function ChatWidget() {
  const { status, user } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const nextId = useRef(1);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, typing]);

  if (status === 'loading') return null;
  if (user && user.role !== 'customer') return null;
  const isCustomer = user?.role === 'customer';

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  async function send(text: string) {
    const message = text.trim().slice(0, MAX_LENGTH);
    if (!message || typing) return;
    setMessages((m) => [...m, { id: nextId.current++, from: 'you', text: message }]);
    setDraft('');
    setTyping(true);
    try {
      const answer = await askChatbot(message, sessionId);
      setSessionId(answer.session_id);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, from: 'bot', text: answer.reply.text, reply: answer.reply },
      ]);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          from: 'bot',
          text:
            status === 429
              ? 'You are asking quickly. Please wait a minute and try again.'
              : "Sorry, I couldn't answer just now. Please try again in a moment.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const lastBot = [...messages].reverse().find((m) => m.from === 'bot');
  const quick: ChatAction[] = [
    { label: 'Book an appointment', url: isCustomer ? '/customer/book' : '/salon' },
    { label: 'Services', url: '/salon' },
    ...(isCustomer ? [{ label: 'My Appointments', url: '/customer/appointments' }] : []),
  ];

  return (
    <div className="no-print fixed bottom-md right-md z-nav flex flex-col items-end gap-sm">
      {open && (
        <section
          role="dialog"
          aria-label={CHATBOT_NAME}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="glass-dense flex h-[32rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card"
        >
          <header className="flex items-center justify-between gap-sm border-b border-border px-md py-sm">
            <h2 className="text-base font-semibold text-text">{CHATBOT_NAME}</h2>
            <button
              type="button"
              aria-label="Close chat"
              onClick={close}
              className="rounded-full p-xs text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <nav
            aria-label="Quick actions"
            className="flex flex-wrap gap-xs border-b border-border px-md py-xs"
          >
            {quick.map((a) => (
              <ActionLink key={a.label} action={a} onNavigate={() => setOpen(false)} />
            ))}
          </nav>

          <div
            className="flex-1 space-y-sm overflow-y-auto px-md py-sm"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex flex-col gap-xs', m.from === 'you' && 'items-end')}
              >
                <p
                  className={cn(
                    'max-w-[85%] whitespace-pre-line rounded-card px-md py-sm text-sm',
                    m.from === 'you' ? 'bg-primary text-on-primary' : 'bg-surface text-text',
                  )}
                >
                  {m.text}
                </p>
                {m.from === 'bot' && m.reply?.show_rephrase && m.reply.rephrased && (
                  <p className="text-xs text-text-muted">I understood: {m.reply.rephrased}</p>
                )}
                {m.from === 'bot' && m.reply && m.reply.actions.length > 0 && (
                  <div className="flex flex-wrap gap-xs">
                    {m.reply.actions.map((a) => (
                      <ActionLink
                        key={a.label + a.url}
                        action={a}
                        onNavigate={() => setOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <p className="text-sm text-text-muted" role="status">
                <span className="sr-only">{CHATBOT_NAME} is typing</span>
                <span aria-hidden="true" className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-text-muted" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
                </span>
              </p>
            )}
            <div ref={end} />
          </div>

          {lastBot?.reply && lastBot.reply.suggestions.length > 0 && !typing && (
            <div className="border-t border-border px-md py-xs">
              {lastBot.reply.source === 'clarify' && (
                <p className="pb-xs text-xs font-medium text-text">Did you mean:</p>
              )}
              <ul className="flex flex-wrap gap-xs" aria-label="Suggested questions">
                {lastBot.reply.suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-border bg-surface px-md py-xs text-left text-sm text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-xs border-t border-border p-sm"
          >
            <label htmlFor="chatbot-input" className="sr-only">
              Your question
            </label>
            <input
              id="chatbot-input"
              ref={input}
              value={draft}
              maxLength={MAX_LENGTH}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about services, booking, prices…"
              className="h-11 flex-1 rounded-input border border-border bg-surface px-md text-sm text-text placeholder:text-text-muted focus-visible:shadow-focus focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={typing || !draft.trim()}
              aria-busy={typing || undefined}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {typing ? <Spinner size="sm" /> : <Send className="h-5 w-5" aria-hidden="true" />}
            </button>
          </form>
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-label={`${open ? 'Close' : 'Open'} ${CHATBOT_NAME}`}
        onClick={() => (open ? close() : setOpen(true))}
        className="glass-dense inline-flex h-14 items-center gap-sm rounded-full px-lg text-sm font-semibold text-text shadow-raised hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
        <span className="hidden sm:inline">{CHATBOT_NAME}</span>
      </button>
    </div>
  );
}
