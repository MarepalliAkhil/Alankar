import photos from 'virtual:photo-manifest';
import { useLayoutEffect, useRef, useState } from 'react';
import { AI_SLOTS } from '../../../vite-plugins/photo-slots.js';
import { smallCopy } from '../../components/air/air-images';
import { PageHeader } from '../../components/layout/PageContainer';
import { Card } from '../../components/ui';
import { photoSources } from '../../design/art';
import { cn } from '../../lib/cn';
import {
  AI_INTRO,
  AI_ROWS,
  AIR_INTRO,
  AIR_ROWS,
  AIR_TESTS,
  ZENOTI_AI_RECEPTIONIST,
  accuracyText,
  assignAiPictures,
  type Row,
  type RowImage,
} from './ai-content';
import { useZenotians } from './context';
import { Ext } from './parts';
import { motionAllowed } from './reveal';

/** The picture of a row: the exact file only (no stand-in). A missing or broken file hides it. */
function Picture({ image }: { image: RowImage }) {
  const [broken, setBroken] = useState(false);
  const found = photoSources({ photo: image.slot }, photos);
  if (!found || broken) return null;
  const pose = image.kind === 'pose';
  const small = pose && found.webp ? smallCopy(found.webp) : null;
  return (
    <figure className="zen-row__image" data-kind={image.kind}>
      <picture>
        {found.webp && (
          <source
            type="image/webp"
            srcSet={small ? `${small} 512w, ${found.webp} 1024w` : found.webp}
            sizes="(min-width: 768px) 40vw, 92vw"
          />
        )}
        <img
          src={found.src}
          alt={image.alt}
          width={pose ? 1024 : 1280}
          height={pose ? 1024 : 960}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={pose ? 'object-contain' : 'object-cover'}
        />
      </picture>
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>
  );
}

/**
 * Rows of "words left, picture right" (stacked heading, picture, words on phones). Each row slides
 * in as it enters: the words from the left, the picture from the right. Reduced motion or no
 * IntersectionObserver: everything is simply shown.
 */
function Rows({ rows, label }: { rows: Row[]; label: string }) {
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || !motionAllowed()) return;
    el.setAttribute('data-row-motion', 'on');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    el.querySelectorAll(':scope > li').forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, []);
  return (
    <ol ref={list} className="zen-rows" aria-label={label}>
      {rows.map((row) => (
        <li key={row.id} className="zen-row" data-row={row.id}>
          <h3 className="zen-row__title">{row.title}</h3>
          <Picture image={row.image} />
          <p className="zen-row__text">{row.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function AirSection() {
  return (
    <div className="flex flex-col gap-md">
      <PageHeader title="AIR, the AI receptionist" description={AIR_INTRO} />
      <Rows rows={AIR_ROWS} label="What AIR does" />
      <Card variant="dense" as="section" aria-labelledby="air-compare" className="mt-lg">
        <h3 id="air-compare" className="zen-row__title">
          How it compares to Zenoti
        </h3>
        <p className="mt-sm text-text">
          Zenoti offers an AI Receptionist that answers calls and texts, books, reschedules,
          confirms and hands over to staff (
          <Ext href={ZENOTI_AI_RECEPTIONIST}>Zenoti: AI Receptionist</Ext>). AIR follows the same
          idea for one shop, through the website chat and the browser&apos;s own voice: there are no
          real phone calls, and payments and text messages are simulated. AIR has {AIR_TESTS}{' '}
          automated tests of its own (counted from backend/air/tests).
        </p>
      </Card>
    </div>
  );
}

export function AiIntelligenceSection() {
  const { content } = useZenotians();
  const accuracy: Row = {
    id: 'accuracy',
    title: 'Measured, not guessed',
    text: accuracyText(content.quality?.accuracy ?? []),
    image: {
      slot: AI_SLOTS.accuracy,
      kind: 'screenshot',
      alt: 'The chatbot accuracy cards on the Quality evidence section',
    },
  };
  const rows = assignAiPictures([...AI_ROWS.slice(0, 3), accuracy, ...AI_ROWS.slice(3)], photos);
  return (
    <div className="flex flex-col gap-md">
      <PageHeader title="AI Alankar Intelligence" description={AI_INTRO} />
      <Rows rows={rows} label="How AI Alankar Intelligence works" />
      <p className={cn('mt-lg rounded-card border border-border p-md text-text')}>
        The admin assistant, &ldquo;Alankar Intelligence&rdquo;, is planned future work and is not
        built.
      </p>
    </div>
  );
}
