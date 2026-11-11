import { useQuery } from '@tanstack/react-query';
import { BellRing, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAirBriefing, type AirBriefing } from '../../api/airDesk';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { useSession } from '../../session/session-context';
import { SpeechBubble } from '../tour/SpeechBubble';
import { useTour } from '../tour/tour-context';
import {
  AIR_ALT,
  AIR_NAME,
  AIR_POSES,
  SPEECH_START_MS,
  alreadyShown,
  canSpeak,
  markShown,
  poseFor,
  readMuted,
  writeMuted,
  type AirPose,
} from './air-data';
import { airSources, smallCopy } from './air-images';

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled])';

function cornerIsClear(img: HTMLImageElement): boolean | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    return ctx.getImageData(0, 0, 1, 1).data[3] < 128;
  } catch {
    return null;
  }
}

/**
 * AIR's picture for a pose, at a fixed square size (no layout shift, never stretched:
 * object-contain). A cut-out stands free; a picture with a plain background sits in a round
 * frame. A pose without a file shows `air.webp`, then the idle pose; with no picture at all a
 * bell icon in a glass circle is shown, so the popup never waits for or breaks on an image.
 */
export function AirCharacter({
  pose,
  className,
  decorative = false,
  eager = false,
}: {
  pose: AirPose;
  className?: string;
  decorative?: boolean;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [cutout, setCutout] = useState<boolean | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const found = airSources(pose, failed);
  const file = found ? (found.webp ?? found.src) : null;
  const small = file && /\.webp$/i.test(file) ? smallCopy(file) : null;
  useEffect(() => setCutout(null), [file]);
  const alt = decorative ? '' : AIR_ALT[pose];
  return (
    <div
      data-air-pose={pose}
      data-air-source={found ? (found.slot === AIR_POSES[pose] ? 'image' : 'fallback') : 'icon'}
      className={cn('relative aspect-square shrink-0', className)}
    >
      {found && file ? (
        <img
          key={file}
          ref={img}
          src={file}
          srcSet={small ? `${small} 512w, ${file} 1024w` : undefined}
          sizes={small ? '(max-width: 640px) 128px, 176px' : undefined}
          width={1024}
          height={1024}
          alt={alt}
          aria-hidden={decorative || undefined}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => img.current && setCutout(cornerIsClear(img.current))}
          onError={() => setFailed((list) => [...list, file])}
          className={cn(
            'meera-float h-full w-full object-contain',
            cutout === false && 'rounded-full bg-surface p-1 ring-4 ring-primary-soft',
          )}
        />
      ) : (
        <span
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : AIR_NAME}
          aria-hidden={decorative || undefined}
          className="glass-photo flex h-full w-full items-center justify-center rounded-full text-text"
        >
          <BellRing aria-hidden="true" className="h-1/3 w-1/3" />
        </span>
      )}
    </div>
  );
}

/** Adds <link rel="preload"> for the first picture so it is ready when the popup opens. */
function usePreload(pose: AirPose, when: boolean) {
  useEffect(() => {
    if (!when) return;
    const found = airSources(pose);
    const file = found ? (found.webp ?? found.src) : null;
    if (!file) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = smallCopy(file) ?? file;
    link.dataset.airPreload = pose;
    document.head.appendChild(link);
    return () => link.remove();
  }, [pose, when]);
}

type SpeechState = 'idle' | 'playing' | 'paused' | 'blocked' | 'unsupported';

/** Reads the briefing aloud with the browser's own voice. Never sends anything anywhere. */
function useSpeech(text: string, autoSpeak: boolean) {
  const supported = canSpeak();
  const [state, setState] = useState<SpeechState>(supported ? 'idle' : 'unsupported');
  const started = useRef(false);

  const play = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (state === 'paused') {
      synth.resume();
      setState('playing');
      return;
    }
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1;
    started.current = false;
    utterance.onstart = () => {
      started.current = true;
      setState('playing');
    };
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState(started.current ? 'idle' : 'blocked');
    synth.speak(utterance);
  };
  const pause = () => {
    if (!supported) return;
    window.speechSynthesis?.pause();
    setState('paused');
  };
  const stop = () => {
    if (!supported) return;
    window.speechSynthesis?.cancel();
    setState('idle');
  };

  useEffect(() => {
    if (!autoSpeak || !supported || !text) return;
    play();
    // Browsers that block speech without a click never fire onstart: offer Play instead.
    const check = window.setTimeout(() => {
      if (!started.current) {
        window.speechSynthesis?.cancel();
        setState('blocked');
      }
    }, SPEECH_START_MS);
    return () => window.clearTimeout(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpeak, text]);

  // (the engine can already be gone when the page is torn down, so never assume it is there)
  useEffect(() => () => window.speechSynthesis?.cancel?.(), []);
  return { state, play, pause, stop, supported };
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border border-border bg-surface px-sm text-sm font-medium text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/**
 * The AIR popup for the receptionist. It opens by itself once per login session with what AIR
 * did since the last session, can be reopened from the small AIR button, closes with Escape or
 * the close button, keeps keyboard focus inside while open (focus returns afterwards), and never
 * covers the page with a backdrop: the receptionist can keep working. The text is always on
 * screen; the browser reads it aloud only if the receptionist has not muted it (Play otherwise).
 */
export function AirPopup() {
  const { user } = useSession();
  const tour = useTour();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const phone = useMediaQuery('(max-width: 640px)');
  const userId = user?.id ?? '';
  const briefing = useQuery({
    queryKey: ['air-briefing', userId],
    queryFn: getAirBriefing,
    enabled: !!userId,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => (userId ? readMuted(userId) : false));
  const [pointing, setPointing] = useState(false);
  const [handing, setHanding] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const data: AirBriefing | undefined = briefing.data;
  const waiting = tour?.busy ?? false;
  const shouldAutoOpen = !!data && !waiting && !alreadyShown(userId, data.since);

  usePreload('welcome', shouldAutoOpen);

  const autoOpened = useRef(false); // at most once per page load, even with blocked storage
  useEffect(() => {
    if (!shouldAutoOpen || !data || autoOpened.current) return;
    autoOpened.current = true;
    markShown(userId, data.since);
    previous.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, [shouldAutoOpen, data, userId]);

  const text = data?.text ?? '';
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    if (!open) return setTyped(false);
    const t = window.setTimeout(() => setTyped(true), reduced ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [open, reduced]);
  const speech = useSpeech(text, open && typed && !muted && !!text);

  const close = () => {
    speech.stop();
    setOpen(false);
    setHanding(false);
    (previous.current ?? launcher.current)?.focus?.();
  };
  const handBack = () => {
    setHanding(true);
    window.setTimeout(close, reduced ? 0 : 700);
  };

  // Focus moves into the popup and stays there while it is open; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!user || user.role !== 'receptionist') return null;

  const pose: AirPose = briefing.isPending
    ? poseFor('loading')
    : briefing.isError
      ? poseFor('error')
      : handing
        ? poseFor('handover')
        : pointing
          ? poseFor('pointing')
          : speech.state === 'playing'
            ? poseFor('speaking')
            : !typed
              ? poseFor('greeting')
              : poseFor('mood', data?.mood, data?.numbers);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeMuted(userId, next);
    if (next) speech.stop();
  };
  const reopen = () => {
    previous.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  return (
    <>
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={reopen}
          aria-label="Open AIR, what the virtual receptionist did"
          className="glass-button no-print fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-nav inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-raised focus-visible:shadow-focus focus-visible:outline-none"
        >
          <AirCharacter pose="idle" decorative className="h-12 w-12" />
        </button>
      )}
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="air-popup-title"
          data-air-popup
          data-layout={phone ? 'sheet' : 'card'}
          tabIndex={-1}
          className={cn(
            'glass-photo no-print fixed z-toast flex flex-col gap-sm overflow-y-auto p-md focus:outline-none',
            !reduced && 'tour-card',
            phone
              ? 'inset-x-0 bottom-0 max-h-[80dvh] rounded-t-card pb-[max(1rem,env(safe-area-inset-bottom))]'
              : 'bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] max-h-[calc(100dvh-2rem)] w-[clamp(320px,92vw,460px)] rounded-card',
          )}
        >
          <div className="flex items-start justify-between gap-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              AIR · virtual receptionist
            </p>
            <IconButton label="Close AIR" onClick={close}>
              <X aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex items-end gap-xs">
            <AirCharacter
              pose={pose}
              eager
              className={phone ? 'w-32' : 'w-[clamp(112px,36%,176px)]'}
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 24 8"
              className="mb-6 h-2 w-6 shrink-0"
              data-air-connector
            >
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                className={cn(!reduced && 'tour-connector')}
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="0.1 6"
              />
            </svg>
            {briefing.isPending ? (
              <p
                className="min-w-0 flex-1 rounded-card bg-primary-soft p-sm text-sm text-text"
                role="status"
              >
                AIR is counting what happened…
              </p>
            ) : briefing.isError ? (
              <p
                className="min-w-0 flex-1 rounded-card bg-primary-soft p-sm text-sm text-text"
                role="alert"
              >
                AIR could not load its summary. The AIR Activity page has the full list.
              </p>
            ) : (
              <SpeechBubble
                stepKey={data?.since ?? 'air'}
                title={data?.did_nothing ? 'A quiet session' : 'While you were away'}
                titleId="air-popup-title"
                text={text}
                instant={reduced}
              />
            )}
          </div>
          {data?.wording_by_ai && <p className="text-xs text-text-muted">Wording by AI</p>}
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div className="flex flex-wrap gap-xs">
              {speech.supported && (
                <IconButton
                  label={speech.state === 'playing' ? 'Pause reading' : 'Read aloud'}
                  onClick={speech.state === 'playing' ? speech.pause : speech.play}
                >
                  {speech.state === 'playing' ? (
                    <Pause aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Play aria-hidden="true" className="h-4 w-4" />
                  )}
                  <span className="text-xs">{speech.state === 'playing' ? 'Pause' : 'Play'}</span>
                </IconButton>
              )}
              {speech.supported && (
                <IconButton
                  label={
                    muted ? 'Unmute: read aloud by itself' : 'Mute: never read aloud by itself'
                  }
                  pressed={muted}
                  onClick={toggleMute}
                >
                  {muted ? (
                    <VolumeX aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Volume2 aria-hidden="true" className="h-4 w-4" />
                  )}
                </IconButton>
              )}
            </div>
            <div className="flex flex-wrap gap-xs">
              <Link
                to="/air-activity"
                onClick={close}
                onMouseEnter={() => setPointing(true)}
                onMouseLeave={() => setPointing(false)}
                onFocus={() => setPointing(true)}
                onBlur={() => setPointing(false)}
                className="inline-flex h-10 items-center rounded-full border border-border bg-surface px-md text-sm font-medium text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
              >
                Open AIR Activity
              </Link>
              <button
                type="button"
                onClick={handBack}
                className="inline-flex h-10 items-center rounded-full bg-primary px-md text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
              >
                I have the desk
              </button>
            </div>
          </div>
          {speech.state === 'blocked' && (
            <p className="text-xs text-text-muted" role="status">
              Your browser did not allow reading aloud by itself. Press Play to hear it.
            </p>
          )}
        </div>
      )}
    </>
  );
}
