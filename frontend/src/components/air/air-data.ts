/**
 * AIR, the virtual receptionist: its pictures, which picture belongs to which moment, and the
 * small pieces of state the popup remembers (shown once per login session, mute per user).
 * The pictures are files the owner supplies in public/photos/air/ (see docs/IMAGE_SLOTS.md).
 */

export const AIR_POSES = {
  welcome: 'air-01-welcome',
  idle: 'air-02-idle',
  explain: 'air-03-explain',
  'point-right': 'air-04-point-right',
  report: 'air-05-report',
  'thumbs-up': 'air-06-thumbs-up',
  thinking: 'air-07-thinking',
  attention: 'air-08-attention',
  concerned: 'air-09-concerned',
  celebrate: 'air-10-celebrate',
  'on-call': 'air-11-on-call',
  handover: 'air-12-handover',
  sleep: 'air-13-sleep',
} as const;
export type AirPose = keyof typeof AIR_POSES;

/** The default picture (public/photos/air/air.webp): used for any pose without its own file. */
export const AIR_DEFAULT_SLOT = 'air';
/** When the default picture is missing too, this pose's picture is used. */
export const AIR_LAST_RESORT: AirPose = 'idle';
export const AIR_NAME = 'AIR, the virtual receptionist';

export const AIR_ALT: Record<AirPose, string> = {
  welcome: 'AIR, the virtual receptionist, waving hello',
  idle: 'AIR, the virtual receptionist, standing ready',
  explain: 'AIR, the virtual receptionist, explaining',
  'point-right': 'AIR, the virtual receptionist, pointing to the side',
  report: 'AIR, the virtual receptionist, holding a report',
  'thumbs-up': 'AIR, the virtual receptionist, giving a thumbs-up',
  thinking: 'AIR, the virtual receptionist, thinking',
  attention: 'AIR, the virtual receptionist, asking for your attention',
  concerned: 'AIR, the virtual receptionist, looking concerned',
  celebrate: 'AIR, the virtual receptionist, celebrating',
  'on-call': 'AIR, the virtual receptionist, on a call',
  handover: 'AIR, the virtual receptionist, handing over the desk',
  sleep: 'AIR, the virtual receptionist, asleep',
};

export type AirMood = 'idle' | 'report' | 'attention' | 'concerned' | 'celebrate';
export type AirMoment =
  | 'loading'
  | 'greeting'
  | 'speaking'
  | 'pointing'
  | 'handover'
  | 'error'
  | 'night-cover'
  | 'day-cover';

export interface BriefingNumbers {
  links_paid?: number;
  needs_you?: number;
}

/**
 * The picture for a moment. Greeting = welcome; loading = thinking; reading the numbers aloud =
 * explain; pointing to the page = point-right; handing back the desk = handover; failures =
 * concerned; the cover banner = on-call by day and sleep at night. After the greeting the mood
 * from the server decides: items that need you = attention, expired links or declines =
 * concerned, a good day = celebrate (3 or more paid) or thumbs-up (some paid, nothing waiting),
 * otherwise report, or idle when AIR did nothing.
 */
export function poseFor(moment: AirMoment | 'mood', mood?: AirMood, n?: BriefingNumbers): AirPose {
  switch (moment) {
    case 'loading':
      return 'thinking';
    case 'greeting':
      return 'welcome';
    case 'speaking':
      return 'explain';
    case 'pointing':
      return 'point-right';
    case 'handover':
      return 'handover';
    case 'error':
      return 'concerned';
    case 'night-cover':
      return 'sleep';
    case 'day-cover':
      return 'on-call';
    default:
      break;
  }
  if (mood === 'report' && (n?.links_paid ?? 0) > 0 && !(n?.needs_you ?? 0)) return 'thumbs-up';
  return mood ?? 'idle';
}

/** Night in India (21:00 to 06:59), for the cover banner's sleeping pose. */
export function isNightInIndia(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })
      .formatToParts(now)
      .find((p) => p.type === 'hour')?.value ?? 12,
  );
  return hour >= 21 || hour < 7;
}

// ---- remembered per user (storage can be blocked: everything falls back safely)

export const muteKey = (userId: string) => `air-mute:${userId}`;
export const shownKey = (userId: string) => `air-popup-shown:${userId}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // blocked storage: the setting lasts until the page is reloaded
  }
}

export const readMuted = (userId: string) => read(muteKey(userId)) === '1';
export const writeMuted = (userId: string, muted: boolean) =>
  write(muteKey(userId), muted ? '1' : '0');

/**
 * Once per login session: the briefing carries `since` (when the previous session ended), which
 * changes with every new sign-in. The popup opens by itself only when that value has not been
 * shown yet; reopening from the AIR button is always possible.
 */
export const alreadyShown = (userId: string, since: string) => read(shownKey(userId)) === since;
export const markShown = (userId: string, since: string) => write(shownKey(userId), since);

/** The browser can read text aloud (SpeechSynthesis). */
export function canSpeak(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/** How long to wait for speech to really start before showing Play (autoplay blocked). */
export const SPEECH_START_MS = 1500;
