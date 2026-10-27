import type { ReactNode } from 'react';
import type { ContentBlock } from '../../../api/content';
import { Badge, Button, Card } from '../../ui';

export interface BlockShellProps {
  block: ContentBlock;
  /** The form has edits that are not saved as a draft yet. */
  dirty: boolean;
  busy: boolean;
  problem: string;
  title: string;
  description: string;
  onSave: () => void;
  onDiscard: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  children: ReactNode;
  preview: ReactNode;
}

/** Edit form on the left, live preview on the right, and the draft / publish buttons. */
export function BlockShell({
  block,
  dirty,
  busy,
  problem,
  title,
  description,
  onSave,
  onDiscard,
  onPublish,
  onUnpublish,
  children,
  preview,
}: BlockShellProps) {
  const waiting = block.has_draft || !block.is_published;
  return (
    <Card variant="dense" as="section" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <Badge tone={block.is_published ? 'success' : 'neutral'}>
            {block.is_published ? 'Published' : 'Not published'}
          </Badge>
          {block.has_draft && <Badge tone="warning">Draft waiting</Badge>}
        </div>
      </div>
      <div className="mt-md grid gap-lg lg:grid-cols-2">
        <div className="flex flex-col gap-md">{children}</div>
        <div className="flex flex-col gap-xs">
          <p className="text-sm font-semibold text-text-muted">Preview (as visitors will see it)</p>
          <div className="rounded-card border border-border bg-surface p-md">{preview}</div>
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-md text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div className="mt-md flex flex-wrap gap-sm">
        <Button type="button" variant="secondary" onClick={onSave} loading={busy} disabled={!dirty}>
          Save draft
        </Button>
        <Button type="button" onClick={onPublish} disabled={busy || dirty || !waiting}>
          {block.is_published ? 'Publish draft' : 'Publish'}
        </Button>
        {block.has_draft && (
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={busy}>
            Discard draft
          </Button>
        )}
        {block.can_unpublish && block.is_published && (
          <Button type="button" variant="ghost" onClick={onUnpublish} disabled={busy}>
            Hide from site
          </Button>
        )}
      </div>
      {dirty && (
        <p className="mt-xs text-xs text-text-muted">
          Save the draft before publishing. Nothing reaches the public site until you publish.
        </p>
      )}
    </Card>
  );
}
