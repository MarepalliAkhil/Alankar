import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PageHeader } from '../../components/layout/PageContainer';
import { Card } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSeo } from '../../hooks/useSeo';
import { cn } from '../../lib/cn';
import { useZenotians } from './context';
import { SectionGate } from './SectionGate';
import { Where } from './parts';
import { ROOT } from './model';
import { StoryScene } from './story-visuals';

/** Seconds each chapter stays on screen while the walkthrough plays (7 chapters is about 90 s). */
const SECONDS_PER_CHAPTER = 13;

const control =
  'inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-nested border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';

function StoryBody() {
  const { content } = useZenotians();
  const story = content.story ?? {};
  const chapters = story.chapters ?? [];
  const characters = story.characters ?? [];
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useSeo(
    'A day at Alankar · For Zenotians',
    'One fictional day at the shop, told in seven short chapters, with a note on the code behind each.',
  );

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const count = chapters.length;

  const go = useCallback(
    (index: number, scroll = true) => {
      const next = Math.max(0, Math.min(count - 1, index));
      setActive(next);
      setSeconds(0);
      if (scroll) {
        refs.current[next]?.scrollIntoView?.({
          behavior: reduced ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    },
    [count, reduced],
  );

  // Which chapter is on screen when the visitor scrolls by hand.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = refs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive((now) => (now === index ? now : index));
        }
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    refs.current.forEach((el) => el && seen.observe(el));
    return () => seen.disconnect();
  }, [count]);

  // The walkthrough: one tick per second; at the end of a chapter move to the next one.
  useEffect(() => {
    if (!playing || reduced) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, reduced]);

  useEffect(() => {
    if (!playing || seconds < SECONDS_PER_CHAPTER) return;
    if (active >= count - 1) {
      setPlaying(false);
      setSeconds(0);
      return;
    }
    go(active + 1);
  }, [seconds, playing, active, count, go]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(active - 1);
    }
  };

  const done = active * SECONDS_PER_CHAPTER + Math.min(seconds, SECONDS_PER_CHAPTER);
  const total = count * SECONDS_PER_CHAPTER;

  return (
    <div className="flex flex-col gap-md">
      <PageHeader
        title="A day at Alankar"
        description={story.intro || 'One fictional day at the shop'}
        breadcrumb={[{ label: 'For Zenotians', to: ROOT }, { label: 'A day at Alankar' }]}
      />
      {story.note && <p className="text-sm text-text-muted">{story.note}</p>}

      {characters.length > 0 && (
        <ul aria-label="Characters" className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
          {characters.map((c) => (
            <li key={c.name}>
              <Card variant="dense" className="flex h-full flex-col gap-1">
                <p className="text-base font-semibold text-text">{c.name}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-hover">
                  {c.role}
                </p>
                {c.line && <p className="text-sm text-text-muted">{c.line}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div
        role="group"
        aria-label="Story controls"
        aria-keyshortcuts="ArrowLeft ArrowRight"
        onKeyDown={onKeyDown}
        className="sticky top-16 z-10 flex flex-wrap items-center gap-sm rounded-card border border-border bg-surface p-sm shadow-sm"
      >
        {!reduced && (
          <button
            type="button"
            className={control}
            aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {playing ? 'Pause' : 'Play the 90-second walkthrough'}
          </button>
        )}
        <button
          type="button"
          className={control}
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label="Previous chapter"
        >
          <SkipBack className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={control}
          onClick={() => go(active + 1)}
          disabled={active >= count - 1}
          aria-label="Next chapter"
        >
          <SkipForward className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm text-text" aria-live="polite">
          Chapter {active + 1} of {count}
        </p>
        {!reduced && (
          <progress
            className="zen-meter h-2 min-w-24 flex-1"
            value={done}
            max={total}
            aria-label="Walkthrough progress"
          />
        )}
        <p className="w-full text-xs text-text">
          {reduced
            ? 'Use Previous and Next, or the left and right arrow keys.'
            : 'Left and right arrow keys move between chapters.'}
        </p>
      </div>

      <ol className="flex flex-col gap-lg">
        {chapters.map((chapter, i) => (
          <li
            key={`${chapter.visual}-${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-active={i === active}
            aria-current={i === active ? 'step' : undefined}
            className="story-chapter"
          >
            <Card
              className={cn(
                'grid items-center gap-md md:grid-cols-2',
                i === active && 'ring-2 ring-primary',
              )}
            >
              <div className="flex min-w-0 flex-col gap-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-primary-hover">
                  Chapter {i + 1}
                </p>
                <h2 className="text-xl font-semibold text-text">{chapter.title}</h2>
                <p className="text-text">{chapter.body}</p>
                {(chapter.behind || (chapter.where ?? []).length > 0) && (
                  <aside className="flex flex-col gap-2 rounded-nested bg-primary-soft p-sm">
                    <h3 className="text-sm font-semibold text-text">What’s behind this</h3>
                    {chapter.behind && <p className="text-sm text-text">{chapter.behind}</p>}
                    <Where items={chapter.where} />
                  </aside>
                )}
              </div>
              <div className="min-w-0">
                <StoryScene visual={chapter.visual} />
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function StoryPage() {
  return (
    <SectionGate id="day">
      <StoryBody />
    </SectionGate>
  );
}
