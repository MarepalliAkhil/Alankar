import { useState } from 'react';
import type { AboutContent, ContentBlock, HeroContent } from '../../../api/content';
import { Input, Textarea } from '../../ui';
import { BlockShell } from './BlockShell';
import { useBlockActions } from './useBlockActions';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function HeroEditor({ block }: { block: ContentBlock<'hero'> }) {
  const start = {
    headline: '',
    subtitle: '',
    image_url: '',
    cta_label: '',
    ...block.published,
    ...block.draft,
  } as Required<HeroContent>;
  const [form, setForm] = useState<Required<HeroContent>>(start);
  const actions = useBlockActions('hero');
  const set = (key: keyof HeroContent) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const saved = {
    ...{ headline: '', subtitle: '', image_url: '', cta_label: '' },
    ...(block.draft ?? block.published),
  };
  return (
    <BlockShell
      block={block}
      title="Home page banner"
      description="The big headline at the top of the home page."
      dirty={!same(form, saved)}
      busy={actions.busy}
      problem={actions.problem}
      onSave={() => actions.save.mutate(form)}
      onDiscard={() => actions.discard.mutate()}
      onPublish={() => actions.publish.mutate()}
      onUnpublish={() => actions.unpublish.mutate()}
      preview={
        <div className="flex flex-col gap-xs">
          {form.image_url && (
            <img src={form.image_url} alt="" className="h-32 w-full rounded-nested object-cover" />
          )}
          <p className="text-2xl font-semibold text-text">{form.headline || 'Your headline'}</p>
          <p className="text-text-muted">{form.subtitle || 'A short line under it.'}</p>
          {form.cta_label && (
            <span className="mt-xs w-fit rounded-full bg-primary px-md py-sm text-sm font-medium text-on-primary">
              {form.cta_label}
            </span>
          )}
        </div>
      }
    >
      <Input
        label="Headline"
        value={form.headline}
        onChange={set('headline')}
        error={actions.fields.headline}
        maxLength={120}
      />
      <Textarea
        label="Subtitle"
        value={form.subtitle}
        onChange={set('subtitle')}
        error={actions.fields.subtitle}
        maxLength={300}
      />
      <Input
        label="Image link"
        hint="A https:// link or a path such as /media/hero.jpg. Optional."
        value={form.image_url}
        onChange={set('image_url')}
        error={actions.fields.image_url}
      />
      <Input
        label="Button text"
        hint="Optional."
        value={form.cta_label}
        onChange={set('cta_label')}
        error={actions.fields.cta_label}
        maxLength={40}
      />
    </BlockShell>
  );
}

export function AboutEditor({ block }: { block: ContentBlock<'about'> }) {
  const blank = { heading: '', body: '', image_url: '' };
  const saved = { ...blank, ...(block.draft ?? block.published) } as Required<AboutContent>;
  const [form, setForm] = useState<Required<AboutContent>>(saved);
  const actions = useBlockActions('about');
  const set = (key: keyof AboutContent) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <BlockShell
      block={block}
      title="About us"
      description="The story section on the home page."
      dirty={!same(form, saved)}
      busy={actions.busy}
      problem={actions.problem}
      onSave={() => actions.save.mutate(form)}
      onDiscard={() => actions.discard.mutate()}
      onPublish={() => actions.publish.mutate()}
      onUnpublish={() => actions.unpublish.mutate()}
      preview={
        <div className="flex flex-col gap-xs">
          {form.image_url && (
            <img src={form.image_url} alt="" className="h-32 w-full rounded-nested object-cover" />
          )}
          <p className="text-xl font-semibold text-text">{form.heading || 'Heading'}</p>
          <p className="whitespace-pre-line text-text-muted">{form.body || 'Your story.'}</p>
        </div>
      }
    >
      <Input
        label="Heading"
        value={form.heading}
        onChange={set('heading')}
        error={actions.fields.heading}
        maxLength={120}
      />
      <Textarea
        label="Text"
        rows={6}
        value={form.body}
        onChange={set('body')}
        error={actions.fields.body}
        maxLength={3000}
      />
      <Input
        label="Image link"
        hint="Optional."
        value={form.image_url}
        onChange={set('image_url')}
        error={actions.fields.image_url}
      />
    </BlockShell>
  );
}
