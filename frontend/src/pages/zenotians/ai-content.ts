import { AI_FOLDER, AI_SLOTS } from '../../../vite-plugins/photo-slots.js';
import { AIR_POSES } from '../../components/air/air-data';
import stats from '../../generated/repo-stats.json';

/**
 * The words of the two For Zenotians sections about the AI features. Only what is built (each row
 * was checked against the code and docs/AIR.md). Numbers come from the repository or from the
 * page's own tested content, never typed in: the AIR test count from generated/repo-stats.json, the
 * accuracy figures from the Quality and Limitations content (see AiIntelligenceSection).
 */

export interface RowImage {
  /** Photo slot (public/photos/...): an AIR pose or an AI Alankar Intelligence screenshot. */
  slot: string;
  kind: 'pose' | 'screenshot';
  alt: string;
  caption?: string;
}

export interface Row {
  id: string;
  title: string;
  text: string;
  image: RowImage;
}

const pose = (key: keyof typeof AIR_POSES, alt: string, caption?: string): RowImage => ({
  slot: AIR_POSES[key],
  kind: 'pose',
  alt,
  caption,
});

export const AIR_INTRO =
  'AIR (Alankar Intelligence Receptionist) covers the front desk when nobody is there. It is built, tested, and off until the admin switches it on.';

export const AIR_ROWS: Row[] = [
  {
    id: 'covers',
    title: 'Covers the front desk',
    text: 'AIR works only while no receptionist is on shift and none is signed in. The moment a receptionist signs in, AIR hands the desk back. The admin can also switch the cover on or off by hand, with a reason that goes into the audit log.',
    image: pose('on-call', 'AIR on a call with a headset, covering the front desk'),
  },
  {
    id: 'accepts',
    title: 'Accepts requests',
    text: 'AIR answers the front desk side of a booking request. Fixed rule checks decide (an active customer and service, no visit waiting for a rating, opening hours, a free stylist, an amount and a date within limits), so it works with every AI switch off. It never accepts for the stylist: the stylist still says yes or no.',
    image: pose('thumbs-up', 'AIR giving a thumbs-up after accepting a request'),
  },
  {
    id: 'picks',
    title: 'Picks a stylist',
    text: 'When a customer chooses "Any stylist", AIR picks a qualified stylist who is on shift and free for the whole visit, with the fewest bookings that day. If that stylist declines or does not answer in 15 minutes, AIR asks the next free one, up to two more times.',
    image: pose('point-right', 'AIR pointing to the side, choosing a stylist'),
  },
  {
    id: 'no-double',
    title: 'No double bookings',
    text: 'Every time AIR holds is a slot hold in the database. PostgreSQL exclusion constraints refuse two live holds for one stylist, or one customer, at the same time, and the same row lock as the normal booking path guards each step.',
    image: pose('thinking', 'AIR thinking, checking that a time is still free'),
  },
  {
    id: 'links',
    title: 'Payment links',
    text: 'Once the stylist accepts, AIR sends a payment link that lasts 45 minutes (the admin’s default). The booking is confirmed only after payment, and it may resend a link once, only while the slot is still free. Payments in this project are simulated.',
    image: pose('report', 'AIR holding a report, a payment link sent'),
  },
  {
    id: 'orders',
    title: 'Product orders',
    text: 'In the chat AIR can list products, add them to a visit and place or change an order before it is paid, up to a set quantity per order. Stock moves under a row lock inside one transaction, so it never goes negative, and the stock before and after is logged.',
    image: pose('explain', 'AIR explaining a product order'),
  },
  {
    id: 'never',
    title: 'What AIR never does',
    text: 'Refunds, discounts, price changes, returns and paid orders always go to a person, and AIR never answers for a stylist. A customer can also ask to talk to a person: the desk sees a call-back note.',
    image: pose('attention', 'AIR raising a hand: this needs a person'),
  },
  {
    id: 'reports',
    title: 'Reports to the receptionist',
    text: 'When a receptionist signs in, a popup tells them what AIR did since their last session, read aloud by the browser if they want. The AIR Activity page shows charts with data tables, a needs-you list, and every action with Undo for what can still be undone.',
    image: pose('handover', 'AIR handing the desk back to the receptionist'),
  },
  {
    id: 'safe-ai',
    title: 'Safe AI',
    text: 'The optional language-model layer is off by default and needs a key on the server, the admin’s switch, request and spending caps, and the customer’s consent; the rules take over when it is off or fails. Tests use a fake provider, a number checker keeps every figure in a reworded summary, and every action AIR takes is in an append-only log.',
    image: pose('idle', 'AIR standing ready, with the AI switched off'),
  },
];

export const ZENOTI_AI_RECEPTIONIST = 'https://www.zenoti.com/platform/ai-receptionist';
export const AIR_TESTS = stats.airTests;

export const AI_INTRO =
  'AI Alankar Intelligence is the customer assistant in the corner of the site. Its own engine is a rule program, so every answer can be explained, tested and measured.';

const shot = (key: keyof typeof AI_SLOTS, alt: string): RowImage => ({
  slot: AI_SLOTS[key],
  kind: 'screenshot',
  alt,
});

/** Rows 1 to 3 and 5 to 6. Row 4 ("Measured, not guessed") is built from the measured figures. */
export const AI_ROWS: Row[] = [
  {
    id: 'language',
    title: 'Understanding natural language',
    text: 'Every message is normalised first: lower case, contractions and short forms expanded, filler words dropped. Spelling is corrected against the shop’s own vocabulary, words are stemmed and rewritten to canonical words, and Telugu or Hindi words typed in English letters (for example "haircut entha") are mapped to English. So typos and mixed English, Hinglish and Telugu still work.',
    image: shot(
      'language',
      'AI Alankar Intelligence reading a message with typos and Hinglish words',
    ),
  },
  {
    id: 'intent',
    title: 'Finding the intent',
    text: 'The cleaned words are scored against every intent the assistant knows, and the best match above a threshold wins. A short follow-up reuses the previous topic. When a booking question is missing a detail, the assistant asks one question at a time for the service, the date, the time or the stylist.',
    image: shot('intent', 'The assistant asking a follow-up question for a missing detail'),
  },
  {
    id: 'answers',
    title: 'Answering from knowledge',
    text: 'Questions that are not a fixed intent are answered from the shop’s knowledge entries, ranked with BM25 (the same family of formula search engines use). It answers only from the shop’s own data and, for a signed-in customer, their own records. When nothing matches well enough, it says so and gives the shop’s contact details instead of guessing.',
    image: shot('answers', 'An answer taken from the shop’s knowledge entries'),
  },
  {
    id: 'model',
    title: 'Optional language model, safely',
    text: 'A language model can help read a message, but it is off by default and asks the customer’s consent first. Personal details are removed before anything is sent, every proposed action must pass a strict schema with server-side validation, prompt-injection attempts get a fixed refusal, and a number checker keeps every figure unchanged. If the model is off, slow or wrong, the rule-based engine answers automatically.',
    image: shot('model', 'The consent notice before the optional language model is used'),
  },
  {
    id: 'privacy',
    title: 'Privacy by design',
    text: 'Only the redacted current message can ever reach an AI provider: no chat history, names, account details, payments or photos. The admin has switches for the whole layer, request limits and a monthly spending cap that turns it off when reached.',
    image: shot('privacy', 'The admin switches and spending cap for the optional language model'),
  },
];

/** What the assistant's accuracy row says, from the measured figures on this page. */
export function accuracyText(
  measures: { name?: string; hits: number; total: number; measured_on?: string | null }[],
): string {
  const valid = measures.filter((m) => m.total > 0);
  if (valid.length === 0)
    return 'Not measured yet: no accuracy figures are published on this page.';
  const pct = (m: { hits: number; total: number }) => `${((m.hits / m.total) * 100).toFixed(1)}%`;
  const parts = valid.map((m) => `${m.name ?? 'Measured'}: ${m.hits} of ${m.total} (${pct(m)})`);
  return `${parts.join('. ')}. These questions were written by me, not by real customers, so real accuracy will be lower. The optional language-model mode has not been measured.`;
}

/**
 * Gives every AI row a picture when any AI screenshot exists: a row keeps its own file; a row
 * without one borrows the next unused file from public/photos/ai-intelligence/ (then reuses them in
 * turn). A borrowed file keeps the alt text of the row it was made for, so the alt always describes
 * the picture. With no AI files at all, rows show no picture (never a broken image).
 */
export function assignAiPictures(rows: Row[], available: readonly string[]): Row[] {
  const prefix = `${AI_FOLDER}/`;
  const altOf = new Map(rows.map((row) => [row.image.slot.toLowerCase(), row.image.alt]));
  const bases = [
    ...new Set(
      available
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length).replace(/\.[a-z]+$/i, ''))
        .filter((base) => !/-(512|960)$/.test(base)),
    ),
  ].sort();
  if (bases.length === 0) return rows;
  const has = (slot: string) => bases.some((b) => b.toLowerCase() === slot.toLowerCase());
  const spare = bases.filter(
    (b) => !rows.some((row) => row.image.slot.toLowerCase() === b.toLowerCase()),
  );
  const pool = spare.length > 0 ? spare : bases;
  let next = 0;
  return rows.map((row) => {
    if (has(row.image.slot)) return row;
    const base = pool[next % pool.length];
    next += 1;
    const alt =
      altOf.get(base.toLowerCase()) ??
      `Screenshot of AI Alankar Intelligence: ${base.replace(/^ai-\d+-/, '').replace(/-/g, ' ')}`;
    return { ...row, image: { ...row.image, slot: base, alt } };
  });
}
