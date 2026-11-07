import { cn } from '../../lib/cn';

/**
 * A headline whose words slide in one after another (see reveal.ts). The text is unchanged: the
 * words are plain spans separated by real spaces, so screen readers read one normal heading.
 */
export function ZenHeadline({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <h1 data-zen-r="words" className={cn(className)}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span className="zen-word" ref={(node) => node?.style.setProperty('--w', String(i))}>
            {word}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </h1>
  );
}

/** The thin accent line that draws under the headline. Decorative. */
export function ZenAccent() {
  return (
    <span
      aria-hidden="true"
      data-zen-r="line"
      className="block h-0.5 w-24 rounded-full bg-primary"
    />
  );
}
