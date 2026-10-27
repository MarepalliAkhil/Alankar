import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ContentBlock, ZenotianSection } from '../../../api/content';
import { Button, IconButton, Input, Textarea } from '../../ui';
import { BlockShell } from './BlockShell';
import { useBlockActions } from './useBlockActions';

const MAX = 12;
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function ZenotiansEditor({ block }: { block: ContentBlock<'zenotians'> }) {
  const saved =
    (block.draft ?? (block.published as { sections?: ZenotianSection[] })).sections ?? [];
  const [sections, setSections] = useState<ZenotianSection[]>(saved);
  const actions = useBlockActions('zenotians');
  const change = (index: number, patch: Partial<ZenotianSection>) =>
    setSections((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <BlockShell
      block={block}
      title="For Zenotians page"
      description="The sections of the /zenotians page. About-me text must come from the owner's resume."
      dirty={JSON.stringify(sections) !== JSON.stringify(saved)}
      busy={actions.busy}
      problem={actions.problem}
      onSave={() =>
        actions.save.mutate({
          sections: sections.map((s) => ({ ...s, key: s.key || slug(s.title) || 'section' })),
        })
      }
      onDiscard={() => actions.discard.mutate()}
      onPublish={() => actions.publish.mutate()}
      onUnpublish={() => actions.unpublish.mutate()}
      preview={
        sections.length === 0 ? (
          <p className="text-text-muted">No sections yet.</p>
        ) : (
          <div className="flex flex-col gap-md">
            {sections.map((s, i) => (
              <div key={i}>
                <p className="font-semibold text-text">{s.title || 'Section title'}</p>
                <p className="whitespace-pre-line text-sm text-text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        )
      }
    >
      {sections.length === 0 && <p className="text-sm text-text-muted">No sections yet.</p>}
      {sections.map((section, index) => (
        <div key={index} className="flex flex-col gap-sm rounded-nested border border-border p-md">
          <Input
            label={`Section ${index + 1} title`}
            value={section.title}
            maxLength={120}
            onChange={(e) => change(index, { title: e.target.value })}
          />
          <Textarea
            label="Text"
            rows={4}
            value={section.body}
            maxLength={6000}
            onChange={(e) => change(index, { body: e.target.value })}
          />
          <div>
            <IconButton
              label={`Remove section ${index + 1}`}
              icon={<Trash2 className="size-4" />}
              onClick={() => setSections((rows) => rows.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={sections.length >= MAX}
          onClick={() => setSections((rows) => [...rows, { key: '', title: '', body: '' }])}
        >
          <Plus className="size-4" aria-hidden /> Add a section
        </Button>
      </div>
    </BlockShell>
  );
}
