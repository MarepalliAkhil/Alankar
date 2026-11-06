import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCheck, ImagePlus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { deletePhoto, photoUrl, type ChatMessage, type PhotoTag } from '../../api/chat';
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
import { useSession } from '../../session/session-context';
import { formatDateTime, formatTime } from '../../lib/format';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { DEFAULT_RULES, PHOTO_ACCEPT, PHOTO_TYPES } from './photo-utils';
import { PhotoBody, ReferenceStrip } from './PhotoParts';
import { PhotoPreview } from './PhotoPreview';
import { PhotoViewer } from './PhotoViewer';

function Ticks({ status }: { status: ChatMessage['status'] }) {
  if (status === 'read') {
    return <CheckCheck aria-label="Read" className="h-3.5 w-3.5 text-info-text" />;
  }
  if (status === 'delivered') {
    return <CheckCheck aria-label="Delivered" className="h-3.5 w-3.5 text-text-muted" />;
  }
  return <Check aria-label="Sent" className="h-3.5 w-3.5 text-text-muted" />;
}

interface PhotoHandlers {
  threadId: string;
  onOpen: (imageId: string, alt: string) => void;
  onDelete: (message: ChatMessage) => Promise<void>;
}

function Bubble({ message, photos }: { message: ChatMessage; photos: PhotoHandlers }) {
  return (
    <li className={message.mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          message.mine
            ? 'max-w-[80%] rounded-card bg-primary-soft px-md py-sm text-text'
            : 'max-w-[80%] rounded-card bg-surface px-md py-sm text-text'
        }
      >
        {message.kind === 'image' && message.image ? (
          <PhotoBody
            message={message}
            threadId={photos.threadId}
            onOpen={photos.onOpen}
            onDelete={photos.onDelete}
          />
        ) : (
          /* Plain text only: React escapes it, and line breaks are kept. Never inner HTML. */
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
        )}
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
  const { user } = useSession();
  const rules = chat.history?.photo ?? DEFAULT_RULES;
  const defaultTag: PhotoTag = user?.role === 'customer' ? 'style_reference' : 'other';
  const [picked, setPicked] = useState<File | null>(null);
  const [pickError, setPickError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; alt: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
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

  const { photoDeleted } = chat;
  const removePhoto = useCallback(
    async (message: ChatMessage) => {
      if (!message.image) return;
      await deletePhoto(id, message.image.id);
      photoDeleted(message.id);
    },
    [id, photoDeleted],
  );

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

  const choose = (files: FileList | File[] | null | undefined) => {
    const file = files?.[0];
    if (!file || !open) return;
    if (!PHOTO_TYPES.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setPickError('Only JPG, PNG and WebP photos can be sent.');
      return;
    }
    setPickError('');
    setPicked(file);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer?.files);
  };
  const onPaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
      f.type.startsWith('image/'),
    );
    if (file) {
      event.preventDefault();
      choose([file]);
    }
  };
  const photos: PhotoHandlers = {
    threadId: id,
    onOpen: (imageId, alt) => setViewing({ id: imageId, alt }),
    onDelete: removePhoto,
  };

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

      <ReferenceStrip
        threadId={id}
        references={chat.history.references ?? []}
        onOpen={photos.onOpen}
      />

      <Card
        className={
          dragging
            ? 'flex h-[55vh] flex-col gap-sm overflow-y-auto ring-2 ring-primary'
            : 'flex h-[55vh] flex-col gap-sm overflow-y-auto'
        }
        role="log"
        tabIndex={0}
        aria-label="Messages"
        aria-live="polite"
        onDragOver={(event: DragEvent) => {
          if (open && event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {chat.messages.length === 0 ? (
          <p className="m-auto text-sm text-text-muted">No messages yet. Say hello.</p>
        ) : (
          <ul className="flex flex-col gap-sm" aria-label="Messages">
            {chat.messages.map((m) => (
              <Bubble key={m.id} message={m} photos={photos} />
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
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            hint={`${text.length} of ${max}. Plain text only.`}
          />
          {(chat.problem || pickError) && (
            <p role="alert" className="text-sm text-danger-text">
              {pickError || chat.problem}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-sm">
            <Button type="submit" disabled={!text.trim()}>
              Send
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              aria-label="Send a photo"
            >
              <ImagePlus aria-hidden="true" className="h-4 w-4" />
              Photo
            </Button>
            <Button
              variant="secondary"
              className="hidden [@media(pointer:coarse)]:inline-flex"
              onClick={() => cameraInput.current?.click()}
              aria-label="Take a photo with the camera"
            >
              <Camera aria-hidden="true" className="h-4 w-4" />
              Camera
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="photo-input"
              onChange={(event) => {
                choose(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="camera-input"
              onChange={(event) => {
                choose(event.target.files);
                event.target.value = '';
              }}
            />
            <span className="text-xs text-text-muted">
              JPG, PNG or WebP, up to 5 MB. You can also drop or paste a photo.
            </span>
          </div>
        </form>
      )}
      <PhotoPreview
        file={picked}
        rules={rules}
        defaultTag={defaultTag}
        onClose={() => setPicked(null)}
        send={({ file, tag, caption, onProgress }) =>
          chat.sendPhoto({ file, tag, caption, onProgress })
        }
      />
      {viewing && (
        <PhotoViewer
          src={photoUrl(id, viewing.id, 'full')}
          alt={viewing.alt}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
