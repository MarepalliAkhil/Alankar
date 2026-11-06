import { useEffect, useId, useState } from 'react';
import type { PhotoRules, PhotoTag } from '../../api/chat';
import { Button, FilterChips, Modal, Textarea } from '../../components/ui';
import { NOT_A_PHOTO, checkPhoto, looksLikePhoto, measure, uploadProblem } from './photo-utils';

interface Props {
  file: File | null;
  rules: PhotoRules;
  defaultTag: PhotoTag;
  onClose: () => void;
  send: (input: {
    file: File;
    tag: PhotoTag;
    caption: string;
    onProgress: (percent: number) => void;
  }) => Promise<unknown>;
}

/** The preview before sending: tag chips, a caption box, and the upload progress. */
export function PhotoPreview({ file, rules, defaultTag, onClose, send }: Props) {
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState<PhotoTag>(defaultTag);
  const [caption, setCaption] = useState('');
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const progressId = useId();

  useEffect(() => {
    if (!file) return;
    const early = checkPhoto(file, rules);
    setProblem(early);
    setTag(defaultTag);
    setCaption('');
    setPercent(0);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    let live = true;
    if (!early) {
      void looksLikePhoto(file).then((real) => {
        if (live && !real) setProblem(NOT_A_PHOTO);
      });
      void measure(objectUrl).then((size) => {
        if (!live || !size) return;
        if (size.width > rules.max_side || size.height > rules.max_side) {
          setProblem(`That photo is larger than ${rules.max_side} pixels on a side.`);
        }
      });
    }
    return () => {
      live = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, rules, defaultTag]);

  if (!file) return null;

  const submit = async () => {
    if (busy || problem) return;
    setBusy(true);
    setPercent(0);
    try {
      await send({ file, tag, caption, onProgress: setPercent });
      onClose();
    } catch (error) {
      setProblem(uploadProblem(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => (busy ? undefined : onClose())}
      title="Send a photo"
      description="Only you and the other person in this conversation can see it."
      busy={busy}
      busyMessage="Sending your photo…"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || Boolean(problem)}>
            Send photo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        {url && !problem && (
          <img
            src={url}
            alt="Preview of the photo you are about to send"
            className="mx-auto max-h-64 w-auto max-w-full rounded-nested object-contain"
          />
        )}
        <FilterChips
          label="What is this photo?"
          options={rules.tags.map((t) => ({ value: t.key, label: t.label }))}
          value={tag}
          onChange={setTag}
        />
        <Textarea
          label="Caption (optional)"
          value={caption}
          maxLength={rules.max_caption}
          rows={2}
          onChange={(event) => setCaption(event.target.value)}
          hint={`${caption.length} of ${rules.max_caption}. Plain text only.`}
        />
        {busy && (
          <div className="flex flex-col gap-xs">
            <label htmlFor={progressId} className="text-xs text-text-muted">
              Uploading… {percent}%
            </label>
            <progress
              id={progressId}
              value={percent}
              max={100}
              className="h-2 w-full accent-primary"
            />
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
