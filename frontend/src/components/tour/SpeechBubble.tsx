import { useEffect, useRef, useState } from 'react';

/** How long the three typing dots show before the line appears, and the pace of the reveal. */
export const TYPING_MS = 700;
export const WORD_MS = 35;

/**
 * Meera's speech bubble. When a chapter opens it first shows three pulsing dots (about 700 ms),
 * then the line appears word by word. Clicking the bubble shows the whole line at once; with
 * reduced motion the line is simply shown. The bubble reserves the height of the full line, so
 * nothing moves while it types. Screen readers get the full line immediately (and once: the
 * animated copy is hidden from them, and the tour's polite live region announces the chapter).
 */
export function SpeechBubble({
  stepKey,
  title,
  titleId,
  text,
  instant,
}: {
  stepKey: string;
  title: string;
  titleId: string;
  text: string;
  instant: boolean;
}) {
  const words = text.split(' ');
  const [count, setCount] = useState(instant ? words.length : -1); // -1: typing dots
  const total = useRef(words.length);
  useEffect(() => {
    total.current = words.length;
    if (instant) {
      setCount(words.length);
      return;
    }
    setCount(-1);
    let reveal = 0;
    const start = window.setTimeout(() => {
      let n = 0;
      reveal = window.setInterval(() => {
        n += 1;
        setCount(n);
        if (n >= total.current) window.clearInterval(reveal);
      }, WORD_MS);
    }, TYPING_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(reveal);
    };
    // A new chapter (stepKey) restarts the typing; the text belongs to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, instant]);

  const typing = count < 0;
  const finished = count >= words.length;
  return (
    // The click only skips the animation; the same thing is done by Next (keyboard users).
    <div
      data-bubble
      data-state={typing ? 'typing' : finished ? 'done' : 'speaking'}
      onClick={() => setCount(words.length)}
      className="relative min-w-0 flex-1 rounded-card border border-border bg-primary-soft p-sm sm:rounded-bl-none"
    >
      <h2 id={titleId} className="text-sm font-semibold text-text">
        {title}
      </h2>
      <span className="sr-only">{text}</span>
      <p aria-hidden="true" className="grid text-sm text-text">
        <span className="invisible [grid-area:1/1]">{text}</span>
        {typing ? (
          <span
            data-typing
            className="flex items-center gap-1.5 self-start [grid-area:1/1]"
            role="presentation"
          >
            <i className="tour-typing-dot" />
            <i className="tour-typing-dot" />
            <i className="tour-typing-dot" />
          </span>
        ) : (
          <span data-speech className="[grid-area:1/1]">
            {words.slice(0, count).join(' ')}
          </span>
        )}
      </p>
    </div>
  );
}
