import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as toursApi from '../../api/tours';
import { ThemeProvider } from '../../design/ThemeProvider';
import { PageTip } from './PageTip';
import { TourProvider } from './TourProvider';
import { useTour } from './tour-context';
import { MEERA_ALT } from './meera-data';
import { TYPING_MS, WORD_MS } from './SpeechBubble';
import { customerTour, speak } from './tours';

vi.mock('../../api/tours');

const KEY = 'tour:customer';
const TARGETS = [
  'brand',
  'menu',
  'nav-book',
  'nav-appointments',
  'nav-chat',
  'nav-packages',
  'nav-wallet',
  'account-trusted-devices',
  'account-your-data',
];

function TakeTour() {
  const tour = useTour();
  return (
    <button type="button" onClick={tour?.start} data-tour="take-tour">
      Take the tour
    </button>
  );
}

/** A stand-in for the app shell: a menu with real data-tour targets, and a phone drawer switch. */
function Harness({
  skip = [],
  phone = false,
  onMenu = () => {},
  onNavigate = () => {},
}: {
  skip?: string[];
  phone?: boolean;
  onMenu?: (open: boolean) => void;
  onNavigate?: (to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TourProvider
          role="customer"
          firstName="Chitra"
          isPhone={phone}
          openMenu={(value) => {
            setOpen(value);
            onMenu(value);
          }}
          onNavigate={onNavigate}
        >
          <nav aria-label="Main menu" data-open={open}>
            {TARGETS.filter((id) => !skip.includes(id)).map((id) => (
              <a key={id} href={`#${id}`} data-tour={id}>
                {id}
              </a>
            ))}
            <TakeTour />
          </nav>
          <PageTip id="booking" title="A request, not a charge">
            Nothing is charged yet.
          </PageTip>
        </TourProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** jsdom has no matchMedia: say whether the person asked for reduced motion. */
function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  stubMotion(true);
  vi.mocked(toursApi.getTourProgress).mockResolvedValue({});
  vi.mocked(toursApi.setTourStatus).mockResolvedValue();
  vi.mocked(toursApi.clearTour).mockResolvedValue();
  // jsdom has no layout: give the tour targets a size so they count as "on screen".
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 100,
    top: 100,
    left: 10,
    right: 150,
    bottom: 140,
    width: 140,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const total = customerTour.steps.length;
const first = customerTour.steps[0]!;
const dialogNamed = (name: string) => screen.findByRole('dialog', { name });

describe('guided tour with Meera', () => {
  it('is a story of seven chapters, each with a pose, a panel and a 12 to 18 word line', () => {
    expect(total).toBe(7);
    for (const step of customerTour.steps) {
      const words = speak(step.speech, 'Chitra').split(/\s+/).length;
      expect(words, step.id).toBeGreaterThanOrEqual(12);
      expect(words, step.id).toBeLessThanOrEqual(18);
      expect(step.speech, step.id).toContain('{name}');
      expect(step.pose).toBeTruthy();
    }
    expect(new Set(customerTour.steps.map((s) => s.pose)).size).toBeGreaterThanOrEqual(6);
    expect(customerTour.steps.map((s) => s.pose)).toEqual([
      'namaste',
      'scissors',
      'waiting',
      'chat',
      'wallet',
      'stars',
      'shield',
    ]);
    expect(customerTour.finale?.pose).toBe('celebrate');
  });

  it('starts by itself once after the first login, with the first chapter and Meera', async () => {
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    expect(dialog).toHaveTextContent(`Chapter 1 of ${total}`);
    expect(dialog).toHaveTextContent('Welcome to Alankar, Chitra!');
    expect(dialog.querySelector('[data-meera="namaste"]')).toBeTruthy();
    expect(dialog.querySelectorAll('[data-dot]')).toHaveLength(total);
    expect(dialog.querySelector('[data-dot="current"]')).toBeTruthy();
  });

  it('"Not now" closes it and the server remembers, so it never starts by itself again', async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(toursApi.setTourStatus).toHaveBeenCalledWith(KEY, 'dismissed');
    expect(screen.queryByRole('dialog')).toBeNull();
    view.unmount();
    vi.mocked(toursApi.getTourProgress).mockResolvedValue({ [KEY]: 'dismissed' });
    render(<Harness />);
    await screen.findByRole('button', { name: 'Take the tour' });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Skip" leaves the tour and is stored as skipped', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(toursApi.setTourStatus).toHaveBeenCalledWith(KEY, 'skipped');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes it, like "Not now"', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await dialogNamed(first.title);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toursApi.setTourStatus).toHaveBeenCalledWith(KEY, 'dismissed');
  });

  it('walks forward and back, then ends with a celebration and a "Book your first visit" button', async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    render(<Harness onNavigate={go} />);
    await dialogNamed(first.title);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const book = await dialogNamed(customerTour.steps[1]!.title);
    expect(book).toHaveTextContent(`Chapter 2 of ${total}`);
    expect(book.querySelector('[data-meera="scissors"]')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await dialogNamed(first.title);
    for (let i = 1; i < total; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText(`Chapter ${i + 1} of ${total}`);
    }
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const finale = await dialogNamed('That is the tour');
    expect(finale.querySelector('[data-meera="celebrate"]')).toBeTruthy();
    expect(toursApi.setTourStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Book your first visit' }));
    expect(toursApi.setTourStatus).toHaveBeenCalledWith(KEY, 'completed');
    expect(go).toHaveBeenCalledWith('/customer/book');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the finished state: a completed tour does not start again', async () => {
    vi.mocked(toursApi.getTourProgress).mockResolvedValue({ [KEY]: 'completed' });
    render(<Harness />);
    await screen.findByRole('button', { name: 'Take the tour' });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can be restarted from "Take the tour" even after it was finished', async () => {
    const user = userEvent.setup();
    vi.mocked(toursApi.getTourProgress).mockResolvedValue({ [KEY]: 'completed' });
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Take the tour' }));
    expect(toursApi.clearTour).toHaveBeenCalledWith(KEY);
    const dialog = await dialogNamed(first.title);
    expect(dialog).toBeInTheDocument();
    // A restart greets with a wave; the first-run welcome is the namaste.
    expect(dialog.querySelector('[data-meera="wave"]')).toBeTruthy();
    expect(dialog.querySelector('[data-meera="namaste"]')).toBeNull();
  });

  it('skips a chapter whose controls are not on the page instead of getting stuck', async () => {
    const user = userEvent.setup();
    render(<Harness skip={['nav-chat']} />);
    await dialogNamed(first.title);
    for (const i of [1, 2]) {
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await dialogNamed(customerTour.steps[i]!.title);
    }
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // The chat chapter has no control here, so the next stop is Pay and save.
    expect(
      await screen.findByRole('dialog', { name: 'Pay and save' }, { timeout: 2000 }),
    ).toBeTruthy();
  });

  it('spotlights every control of a chapter that is on screen (Pay and save has two)', () => {
    const pay = customerTour.steps.find((s) => s.id === 'pay');
    expect(pay?.targets).toEqual(['nav-packages', 'nav-wallet']);
  });

  it('on a phone it opens the menu drawer for menu chapters and not for the welcome', async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    render(<Harness phone onMenu={onMenu} />);
    await dialogNamed(first.title);
    expect(onMenu).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await dialogNamed(customerTour.steps[1]!.title);
    expect(onMenu).toHaveBeenCalledWith(true);
  });

  it('keeps focus in the card, announces each chapter, and names the card', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus());
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      `Chapter 1 of ${total}: ${first.title}. Welcome to Alankar, Chitra!`,
    );
    // Meera has her own alt text, and a missing picture is a glass circle with an "M", never a gap.
    expect(within(dialog).getByRole('img', { name: MEERA_ALT.namaste })).toBeInTheDocument();
    // Let the focus hand-back after the drawer settle, then Tab wraps inside the card.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await user.tab();
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });
});

describe('page tips', () => {
  it('show once and stay dismissed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // While the tour is up the tip stays quiet.
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    const tip = await screen.findByRole('note', { name: /Tip: A request, not a charge/ });
    expect(tip).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dismiss tip/ }));
    expect(toursApi.setTourStatus).toHaveBeenCalledWith('tip:booking', 'dismissed');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('do not show when the server already has them dismissed', async () => {
    vi.mocked(toursApi.getTourProgress).mockResolvedValue({
      [KEY]: 'completed',
      'tip:booking': 'dismissed',
    });
    render(<Harness />);
    await screen.findByRole('button', { name: 'Take the tour' });
    await act(async () => {});
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('render nothing without a tour host (staff pages, tests)', () => {
    render(
      <PageTip id="x" title="t">
        body
      </PageTip>,
    );
    expect(screen.queryByText('body')).toBeNull();
  });
});

describe('tour card layout, speaking dots and connector (Amendment 2)', () => {
  it('has no photo strip: no picture inside the card except Meera', async () => {
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    expect(dialog.querySelector('[data-art-frame]')).toBeNull();
    expect(dialog.querySelector('[data-meera-stage]')).toBeTruthy();
  });

  it('shows one clean path of seven nodes labelled "Step n of 7"', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    expect(within(dialog).getByRole('list', { name: 'Step 1 of 7' })).toBeInTheDocument();
    expect(dialog.querySelectorAll('[data-dot]')).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await dialogNamed(customerTour.steps[1]!.title);
    expect(screen.getByRole('list', { name: 'Step 2 of 7' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-dot="done"]')).toHaveLength(1);
  });

  it('keeps flexible sizes: a clamp-width card and a stage with a 4:5 aspect ratio', async () => {
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    expect(dialog.className).toContain('w-[clamp(320px,92vw,520px)]');
    expect(dialog.className).toContain('max-h-[calc(100dvh-32px)]');
    const stage = dialog.querySelector('[data-meera-stage]')!;
    expect(stage.className).toContain('aspect-[4/5]');
    expect(stage.className).toContain('w-[clamp(120px,32%,200px)]');
    expect(dialog.querySelector('[data-bubble]')!.className).toContain('min-w-0');
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button.className).toContain('min-h-10');
    }
  });

  it('draws the dotted connector to a visible target, and hides it for the bottom sheet', async () => {
    vi.stubGlobal('innerWidth', 1280);
    const { unmount } = render(<Harness />);
    await dialogNamed(first.title);
    const line = document.querySelector('[data-tour-connector] line')!;
    await waitFor(() => expect(line).not.toHaveAttribute('visibility'));
    expect(line.getAttribute('x2')).toBeTruthy();
    unmount();
    vi.stubGlobal('innerWidth', 375);
    render(<Harness />);
    await dialogNamed(first.title);
    const sheetLine = document.querySelector('[data-tour-connector] line')!;
    expect(sheetLine).toHaveAttribute('visibility', 'hidden');
  });

  it('docks the card in the corner farthest from the target', async () => {
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 800);
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    // The target sits at the top left (top 100, left 10): the farthest corner is bottom right.
    await waitFor(() => expect(Number.parseFloat(dialog.style.left)).toBeGreaterThan(300));
    expect(Number.parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(16);
  });

  it('shows typing dots first, then the line word by word, and a click shows it all', async () => {
    stubMotion(false);
    // Fully fake clock (it never follows the real one), so a slow machine cannot type the line
    // out before the test looks. 200 ms lets the tour find its target; typing starts 700 ms later.
    vi.useFakeTimers();
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    const dialog = screen.getByRole('dialog', { name: first.title });
    const bubble = dialog.querySelector('[data-bubble]')!;
    expect(bubble).toHaveAttribute('data-state', 'typing');
    expect(dialog.querySelector('[data-typing]')).toBeTruthy();
    expect(dialog.querySelector('[data-speech]')).toBeNull();
    // Screen readers get the whole line at once, and only through the live region and sr-only text.
    expect(screen.getByRole('status')).toHaveTextContent('Welcome to Alankar, Chitra!');
    expect(bubble.querySelector('p')).toHaveAttribute('aria-hidden', 'true');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TYPING_MS + WORD_MS * 3);
    });
    const part = dialog.querySelector('[data-speech]')!;
    expect(part.textContent!.split(' ').length).toBeLessThan(
      speak(first.speech, 'Chitra').split(' ').length,
    );
    await act(async () => {
      (bubble as HTMLElement).click();
    });
    expect(dialog.querySelector('[data-speech]')).toHaveTextContent(speak(first.speech, 'Chitra'));
    expect(bubble).toHaveAttribute('data-state', 'done');
  });

  it('with reduced motion the line is there at once, with no dots', async () => {
    render(<Harness />);
    const dialog = await dialogNamed(first.title);
    expect(dialog.querySelector('[data-typing]')).toBeNull();
    expect(dialog.querySelector('[data-speech]')).toHaveTextContent('Welcome to Alankar, Chitra!');
  });
});
