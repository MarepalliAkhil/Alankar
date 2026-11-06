import { ImageOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { photoUrl, type ChatMessage, type PhotoReference } from '../../api/chat';
import { Badge, Button, Card, IconButton, Modal } from '../../components/ui';
import { TAG_TONE } from './photo-utils';

/** A photo inside a message bubble: the thumbnail opens the viewer; the sender can delete it. */
export function PhotoBody({
  message,
  threadId,
  onOpen,
  onDelete,
}: {
  message: ChatMessage;
  threadId: string;
  onOpen: (imageId: string, alt: string) => void;
  onDelete: (message: ChatMessage) => Promise<void>;
}) {
  const image = message.image;
  const [broken, setBroken] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (!image) return null;

  if (image.deleted || broken) {
    return (
      <p className="flex items-center gap-sm text-sm italic text-text-muted">
        <ImageOff aria-hidden="true" className="h-4 w-4" />
        {image.deleted ? 'Photo deleted' : 'Photo not available'}
      </p>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setProblem('');
    try {
      await onDelete(message);
      setAsking(false);
    } catch {
      setProblem('We could not delete that photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-xs">
      <button
        type="button"
        onClick={() => onOpen(image.id, image.alt)}
        aria-label={`Open photo: ${image.alt}`}
        className="w-fit rounded-nested focus-visible:shadow-focus focus-visible:outline-none"
      >
        <img
          src={photoUrl(threadId, image.id, 'thumb')}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-auto max-h-60 w-auto max-w-full rounded-nested object-cover"
        />
      </button>
      <div className="flex flex-wrap items-center gap-xs">
        <Badge tone={TAG_TONE[image.tag]}>{image.tag_label}</Badge>
        {message.mine && (
          <IconButton
            label="Delete this photo"
            icon={<Trash2 className="h-4 w-4" />}
            className="h-8 w-8"
            onClick={() => setAsking(true)}
          />
        )}
      </div>
      {message.text && (
        <p className="whitespace-pre-wrap break-words text-sm text-text">{message.text}</p>
      )}
      <Modal
        open={asking}
        onClose={() => (busy ? undefined : setAsking(false))}
        title="Delete this photo?"
        description="It is removed for both of you and cannot be brought back."
        size="sm"
        busy={busy}
        busyMessage="Deleting the photo…"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
              Delete photo
            </Button>
          </>
        }
      >
        {problem && (
          <p role="alert" className="text-sm text-danger-text">
            {problem}
          </p>
        )}
      </Modal>
    </div>
  );
}

/** The latest style-reference photos for this visit, pinned at the top of the thread. */
export function ReferenceStrip({
  threadId,
  references,
  onOpen,
}: {
  threadId: string;
  references: PhotoReference[];
  onOpen: (imageId: string, alt: string) => void;
}) {
  if (references.length === 0) return null;
  return (
    <Card as="section" aria-label="References" className="flex flex-col gap-sm">
      <h2 className="text-sm font-semibold text-text">References</h2>
      <ul className="flex gap-sm overflow-x-auto pb-xs" aria-label="Reference photos">
        {references.map((ref) => (
          <li key={ref.image_id} className="shrink-0">
            <button
              type="button"
              onClick={() => onOpen(ref.image_id, ref.alt)}
              aria-label={`Open reference photo: ${ref.alt}`}
              className="rounded-nested focus-visible:shadow-focus focus-visible:outline-none"
            >
              <img
                src={photoUrl(threadId, ref.image_id, 'thumb')}
                alt={ref.alt}
                width={ref.width}
                height={ref.height}
                loading="lazy"
                className="h-20 w-auto rounded-nested object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
