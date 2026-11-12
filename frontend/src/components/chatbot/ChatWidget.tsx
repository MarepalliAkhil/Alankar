import { MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  airChat,
  airConfirm,
  airSendRequest,
  airStatus,
  setAirConsent,
  type AirAnswer,
  type AirCard,
  type AirPick,
  type AirReply,
  type AirStatus,
  type ConfirmKind,
} from '../../api/air';
import type { ChatAction } from '../../api/chatbot';
import { cn } from '../../lib/cn';
import { useSession } from '../../session/session-context';
import { Spinner } from '../ui/Spinner';
import { AIR_SUBTITLE, CONSENT_TEXT, COVER_NOTE, QUICK_CUSTOMER, QUICK_GUEST } from './air-text';
import { OPEN_CHAT_EVENT } from './chat-events';

export const CHATBOT_NAME = 'AI Alankar Intelligence';
const MAX_LENGTH = 500;

interface Message {
  id: number;
  from: 'bot' | 'you';
  text: string;
  reply?: AirReply;
}

const WELCOME: Message = {
  id: 0,
  from: 'bot',
  text: "Hello! I'm AIR, the virtual receptionist. I can find free times, prepare a booking request for you to send, help with shop orders and answer questions about the salon.",
};

const chipClass =
  'inline-flex max-w-full items-center rounded-full border border-border bg-surface px-md py-xs text-left text-sm font-medium text-text break-words hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';
const primaryClass =
  'inline-flex h-11 items-center justify-center rounded-full bg-primary px-lg text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';

function ActionLink({ action, onNavigate }: { action: ChatAction; onNavigate: () => void }) {
  if (action.url.startsWith('/')) {
    return (
      <Link to={action.url} className={chipClass} onClick={onNavigate}>
        {action.label}
      </Link>
    );
  }
  // tel: links only; the server never sends anything else.
  return (
    <a href={action.url} className={chipClass}>
      {action.label}
    </a>
  );
}

function errorAnswer(error: unknown): { reply?: AirReply; status?: number; detail?: string } {
  const response = (error as { response?: { status?: number; data?: unknown } }).response;
  const data = (response?.data ?? {}) as { reply?: AirReply; detail?: string };
  return { reply: data.reply, status: response?.status, detail: data.detail };
}

function CardView({
  card,
  active,
  busy,
  onSend,
  onConfirm,
  onPick,
}: {
  card: AirCard;
  active: boolean;
  busy: boolean;
  onSend: (holdId: string) => void;
  onConfirm: (kind: ConfirmKind) => void;
  onPick: (pick: AirPick, label: string) => void;
}) {
  const disabled = !active || busy;
  if (card.type === 'booking') {
    return (
      <section
        aria-label="Booking summary"
        className="w-full rounded-card border border-border bg-surface p-md text-sm text-text"
      >
        <h3 className="font-semibold">Booking summary</h3>
        <dl className="mt-xs grid grid-cols-[auto_1fr] gap-x-md gap-y-1">
          <dt className="text-text-muted">Service</dt>
          <dd className="min-w-0 break-words">
            {card.service}
            {card.option ? ` (${card.option})` : ''}
          </dd>
          <dt className="text-text-muted">Price</dt>
          <dd>
            {card.price} <span className="text-text-muted">incl. GST {card.gst_included}</span>
          </dd>
          <dt className="text-text-muted">Duration</dt>
          <dd>{card.duration_minutes} min</dd>
          <dt className="text-text-muted">Stylist</dt>
          <dd className="min-w-0 break-words">{card.stylist}</dd>
          <dt className="text-text-muted">When</dt>
          <dd className="min-w-0 break-words">{card.when}</dd>
        </dl>
        <p className="mt-xs text-xs text-text-muted">
          Not booked yet. Send the request; it is confirmed only after the desk and stylist accept
          and you pay.
        </p>
        <div className="mt-sm flex flex-wrap gap-xs">
          <button
            type="button"
            className={primaryClass}
            disabled={disabled}
            onClick={() => onSend(card.hold_id)}
          >
            Send request
          </button>
          <button
            type="button"
            className={chipClass}
            disabled={disabled}
            onClick={() => onPick({ kind: 'change' }, 'Change')}
          >
            Change
          </button>
        </div>
      </section>
    );
  }
  if (card.type === 'order') {
    return (
      <section
        aria-label="Order summary"
        className="w-full rounded-card border border-border bg-surface p-md text-sm text-text"
      >
        <h3 className="font-semibold">Your order</h3>
        <ul className="mt-xs space-y-1">
          {card.lines.map((ln) => (
            <li key={ln.product} className="flex justify-between gap-sm">
              <span className="min-w-0 break-words">
                {ln.quantity} × {ln.name}
              </span>
              <span className="shrink-0">{ln.amount}</span>
            </li>
          ))}
          <li className="flex justify-between gap-sm text-text-muted">
            <span>Delivery</span>
            <span>{card.delivery_fee}</span>
          </li>
          <li className="flex justify-between gap-sm font-semibold">
            <span>Total</span>
            <span>{card.total}</span>
          </li>
        </ul>
        <p className="mt-xs text-xs text-text-muted">
          Placing the order reserves the items until the payment time runs out.
        </p>
        <div className="mt-sm flex flex-wrap gap-xs">
          <button
            type="button"
            className={primaryClass}
            disabled={disabled}
            onClick={() => onConfirm('order')}
          >
            Place order
          </button>
          <button
            type="button"
            className={chipClass}
            disabled={disabled}
            onClick={() => onPick({ kind: 'cart_clear' }, 'Clear order')}
          >
            Clear
          </button>
        </div>
      </section>
    );
  }
  if (card.type === 'confirm') {
    return (
      <div className="flex flex-wrap gap-xs">
        <button
          type="button"
          className={primaryClass}
          disabled={disabled}
          onClick={() => onConfirm(card.kind)}
        >
          {card.label}
        </button>
      </div>
    );
  }
  return (
    <p className="rounded-card border border-border bg-surface px-md py-sm text-xs text-text-muted">
      The front desk has a note to call you back.
    </p>
  );
}

/**
 * The floating "AI Alankar Intelligence" assistant with AIR, the virtual receptionist. Only for
 * guests and customers: it is not rendered for staff accounts, and the server refuses them too.
 */
export function ChatWidget() {
  const { status, user } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, show);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, show);
  }, []);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [air, setAir] = useState<AirStatus | null>(null);
  const [basic, setBasic] = useState(false);
  const [noticeDone, setNoticeDone] = useState(false);
  const [cover, setCover] = useState(false);
  const nextId = useRef(1);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const isCustomer = user?.role === 'customer';

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, typing]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    airStatus()
      .then((s) => {
        if (!live) return;
        setAir(s);
        setCover(s.cover_active);
      })
      .catch(() => {
        // The status is optional: without it the chat simply stays in basic mode.
      });
    return () => {
      live = false;
    };
  }, [open, user?.id]);

  if (status === 'loading') return null;
  if (user && user.role !== 'customer') return null;

  const aiOffered = Boolean(isCustomer && air?.ai_available);
  const consented = air?.consent === 'granted';
  const aiOn = aiOffered && consented && !basic;
  const showNotice = aiOffered && !consented && !basic && !noticeDone;

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  function addBot(answer: AirAnswer | { reply: AirReply }) {
    if ('session_id' in answer && answer.session_id) setSessionId(answer.session_id);
    if ('cover_active' in answer && typeof answer.cover_active === 'boolean') {
      setCover(answer.cover_active);
    }
    setMessages((m) => [
      ...m,
      { id: nextId.current++, from: 'bot', text: answer.reply.text, reply: answer.reply },
    ]);
  }

  function addBotText(text: string) {
    setMessages((m) => [...m, { id: nextId.current++, from: 'bot', text }]);
  }

  async function run(label: string, call: () => Promise<AirAnswer>) {
    if (typing) return;
    setMessages((m) => [...m, { id: nextId.current++, from: 'you', text: label }]);
    setDraft('');
    setTyping(true);
    try {
      addBot(await call());
    } catch (error) {
      const failed = errorAnswer(error);
      if (failed.reply) addBot({ reply: failed.reply });
      else if (failed.status === 429)
        addBotText('You are asking quickly. Please wait a minute and try again.');
      else if (failed.detail && failed.status && failed.status < 500) addBotText(failed.detail);
      else addBotText("Sorry, I couldn't answer just now. Please try again in a moment.");
    } finally {
      setTyping(false);
    }
  }

  const sendText = (text: string) => {
    const message = text.trim().slice(0, MAX_LENGTH);
    if (!message) return;
    void run(message, () => airChat({ message, sessionId, basicMode: !aiOn }));
  };
  const sendPick = (pick: AirPick, label: string) =>
    void run(label, () => airChat({ pick, sessionId, basicMode: !aiOn }));
  const sendRequest = (holdId: string) =>
    void run('Send request', () => airSendRequest(holdId, sessionId));
  const confirm = (kind: ConfirmKind) =>
    void run(kind === 'order' ? 'Place order' : 'Yes', () => airConfirm(kind, sessionId));

  async function accept() {
    try {
      await setAirConsent(true);
      setAir((s) => (s ? { ...s, consent: 'granted' } : s));
      setNoticeDone(true);
    } catch {
      setNoticeDone(true);
      setBasic(true);
      addBotText("I couldn't save that, so I'll stay in basic mode for now.");
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendText(draft);
  };

  const lastBot = [...messages].reverse().find((m) => m.from === 'bot');
  const quick = isCustomer ? QUICK_CUSTOMER : QUICK_GUEST;
  const chips = lastBot?.reply?.chips ?? [];
  const suggestions = lastBot?.reply?.suggestions ?? [];

  return (
    <div className="no-print fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-nav flex max-w-[calc(100vw-1rem)] flex-col items-end gap-sm">
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
          className="glass-dense flex h-[34rem] max-h-[calc(100dvh-6rem)] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card"
        >
          <header className="flex items-start justify-between gap-sm border-b border-border px-md py-sm">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">{CHATBOT_NAME}</h2>
              <p className="text-xs text-text-muted">{AIR_SUBTITLE}</p>
              {cover && (
                <p className="mt-1 inline-block rounded-full bg-primary-soft px-sm py-0.5 text-xs font-medium text-text">
                  {COVER_NOTE}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-xs">
              {aiOffered && consented && (
                <button
                  type="button"
                  aria-pressed={basic}
                  onClick={() => setBasic((b) => !b)}
                  className="rounded-full border border-border bg-surface px-sm py-0.5 text-xs font-medium text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                >
                  Use basic mode
                </button>
              )}
              <button
                type="button"
                aria-label="Close chat"
                onClick={close}
                className="rounded-full p-xs text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          {showNotice && (
            <section
              aria-label="AI help notice"
              className="border-b border-border bg-surface px-md py-sm text-sm text-text"
            >
              <p>{CONSENT_TEXT}</p>
              <div className="mt-xs flex flex-wrap gap-xs">
                <button type="button" className={primaryClass} onClick={() => void accept()}>
                  Accept
                </button>
                <button
                  type="button"
                  className={chipClass}
                  onClick={() => {
                    setBasic(true);
                    setNoticeDone(true);
                  }}
                >
                  Use basic mode
                </button>
              </div>
            </section>
          )}

          <nav
            aria-label="Quick actions"
            className="flex flex-wrap gap-xs border-b border-border px-md py-xs"
          >
            {quick.map((label) => (
              <button
                key={label}
                type="button"
                className={chipClass}
                disabled={typing}
                onClick={() => sendText(label)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div
            className="min-h-0 flex-1 space-y-sm overflow-y-auto overflow-x-hidden px-md py-sm"
            role="log"
            tabIndex={0}
            aria-live="polite"
            aria-label="Conversation"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex min-w-0 flex-col gap-xs', m.from === 'you' && 'items-end')}
              >
                <p
                  className={cn(
                    'max-w-[85%] whitespace-pre-line break-words rounded-card px-md py-sm text-sm',
                    m.from === 'you' ? 'bg-primary text-on-primary' : 'bg-surface text-text',
                  )}
                >
                  {m.text}
                </p>
                {m.from === 'bot' && m.reply?.wording_by_ai && (
                  <span className="text-xs text-text-muted">Wording by AI</span>
                )}
                {m.from === 'bot' && m.reply?.show_rephrase && m.reply.rephrased && (
                  <p className="text-xs text-text-muted">I understood: {m.reply.rephrased}</p>
                )}
                {m.from === 'bot' && m.reply?.card && (
                  <CardView
                    card={m.reply.card}
                    active={m === lastBot}
                    busy={typing}
                    onSend={sendRequest}
                    onConfirm={confirm}
                    onPick={sendPick}
                  />
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
                  <span className="h-2 w-2 rounded-full bg-text-muted motion-safe:animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-text-muted motion-safe:animate-pulse [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-text-muted motion-safe:animate-pulse [animation-delay:300ms]" />
                </span>
              </p>
            )}
            <div ref={end} />
          </div>

          {(chips.length > 0 || suggestions.length > 0) && !typing && (
            <div className="max-h-32 overflow-y-auto border-t border-border px-md py-xs">
              {lastBot?.reply?.source === 'clarify' && (
                <p className="pb-xs text-xs font-medium text-text">Did you mean:</p>
              )}
              <ul className="flex flex-wrap gap-xs" aria-label="Choices">
                {chips.map((c) => (
                  <li key={c.label + JSON.stringify(c.pick)} className="max-w-full">
                    <button
                      type="button"
                      className={chipClass}
                      onClick={() => sendPick(c.pick, c.label)}
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
                {suggestions.map((s) => (
                  <li key={s} className="max-w-full">
                    <button type="button" className={chipClass} onClick={() => sendText(s)}>
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
              placeholder={aiOn ? 'Type in any words…' : 'e.g. haircut Saturday evening'}
              className="h-11 min-w-0 flex-1 rounded-input border border-border bg-surface px-md text-[16px] lg:text-sm text-text placeholder:text-text-muted focus-visible:shadow-focus focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={typing || !draft.trim()}
              aria-busy={typing || undefined}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {typing ? <Spinner size="sm" /> : <Send className="h-5 w-5" aria-hidden="true" />}
            </button>
          </form>
          <p className="sr-only" aria-live="polite">
            {aiOn ? 'AI mode is on.' : 'Basic mode.'}
          </p>
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
