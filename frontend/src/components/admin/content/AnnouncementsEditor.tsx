import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AnnouncementItem, ContentBlock } from '../../../api/content';
import { Button, IconButton, Input } from '../../ui';
import { BlockShell } from './BlockShell';
import { useBlockActions } from './useBlockActions';

const MAX = 5;

export function AnnouncementsEditor({ block }: { block: ContentBlock<'announcements'> }) {
  const saved = (block.draft ?? (block.published as { items?: AnnouncementItem[] })).items ?? [];
  const [items, setItems] = useState<AnnouncementItem[]>(saved);
  const actions = useBlockActions('announcements');
  const change = (index: number, patch: Partial<AnnouncementItem>) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <BlockShell
      block={block}
      title="Announcement banner"
      description="Short notices shown in a strip on every public page. Leave the dates empty to show it all the time."
      dirty={JSON.stringify(items) !== JSON.stringify(saved)}
      busy={actions.busy}
      problem={actions.problem}
      onSave={() =>
        actions.save.mutate({
          items: items.map((i) => ({
            text: i.text,
            link: i.link ?? '',
            starts: i.starts || null,
            ends: i.ends || null,
          })),
        })
      }
      onDiscard={() => actions.discard.mutate()}
      onPublish={() => actions.publish.mutate()}
      onUnpublish={() => actions.unpublish.mutate()}
      preview={
        items.length === 0 ? (
          <p className="text-text-muted">No announcements.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {items.map((item, i) => (
              <li key={i} className="rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
                {item.text || 'Your notice'}
                {item.link ? <span className="text-primary-hover"> — more</span> : null}
              </li>
            ))}
          </ul>
        )
      }
    >
      {items.length === 0 && <p className="text-sm text-text-muted">No announcements yet.</p>}
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-sm rounded-nested border border-border p-md">
          <Input
            label={`Notice ${index + 1}`}
            value={item.text}
            maxLength={200}
            onChange={(e) => change(index, { text: e.target.value })}
          />
          <Input
            label="Link (optional)"
            hint="A page on this site, such as /salon."
            value={item.link ?? ''}
            onChange={(e) => change(index, { link: e.target.value })}
          />
          <div className="grid gap-sm sm:grid-cols-2">
            <Input
              label="Show from"
              type="date"
              value={item.starts ?? ''}
              onChange={(e) => change(index, { starts: e.target.value })}
            />
            <Input
              label="Show until"
              type="date"
              value={item.ends ?? ''}
              onChange={(e) => change(index, { ends: e.target.value })}
            />
          </div>
          <div>
            <IconButton
              label={`Remove notice ${index + 1}`}
              icon={<Trash2 className="size-4" />}
              onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={items.length >= MAX}
          onClick={() => setItems((rows) => [...rows, { text: '', link: '' }])}
        >
          <Plus className="size-4" aria-hidden /> Add a notice
        </Button>
      </div>
    </BlockShell>
  );
}
