import { render, screen } from '@testing-library/react';
import css from '../../design/index.css?raw';
import bookPage from '../../pages/customer/BookPage.tsx?raw';
import appointmentsPage from '../../pages/customer/AppointmentsPage.tsx?raw';
import packagesPage from '../../pages/customer/MyPackagesPage.tsx?raw';
import membershipsPage from '../../pages/customer/MembershipsPage.tsx?raw';
import walletPage from '../../pages/customer/WalletPage.tsx?raw';
import chatPage from '../../pages/chat/ChatPage.tsx?raw';
import profilePage from '../../pages/customer/ProfilePage.tsx?raw';
import { describe, expect, it, vi } from 'vitest';
import { Meera } from './Meera';
import { MEERA_ALT, MEERA_POSES } from './meera-data';
import { PageTip } from './PageTip';
import { TourContext, type TourValue } from './tour-context';
import { customerTour } from './tours';

const manifest = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock('virtual:photo-manifest', () => ({
  get default() {
    return manifest.files;
  },
}));

const everyPose = () => [
  'meera/meera.webp',
  ...MEERA_POSES.flatMap((pose) => [`meera/meera-${pose}.webp`, `meera/meera-${pose}-512.webp`]),
];

describe('every pose has its own picture', () => {
  it.each(MEERA_POSES)(
    '%s resolves to its own webp, with the 512 px copy for small stages',
    (pose) => {
      manifest.files = everyPose();
      const { container } = render(<Meera pose={pose} />);
      const img = screen.getByRole('img', { name: MEERA_ALT[pose] });
      expect(img).toHaveAttribute('src', `/photos/meera/meera-${pose}.webp`);
      expect(container.querySelector('[data-meera-source="image"]')).not.toBeNull();
      // With only the optimized files present the srcset sits on the img itself.
      const srcset = (container.querySelector('source') ?? img).getAttribute('srcset')!;
      expect(srcset).toContain(`/photos/meera/meera-${pose}-512.webp 410w`);
      expect(srcset).toContain(`/photos/meera/meera-${pose}.webp 820w`);
    },
  );

  it.each(MEERA_POSES)('%s falls back to meera.png when its own file is missing', (pose) => {
    manifest.files = ['meera/meera.png', 'meera/meera.webp'];
    const { container } = render(<Meera pose={pose} decorative />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/photos/meera/meera.png');
    expect(container.querySelector('[data-meera-source="default"]')).not.toBeNull();
  });

  it('shows the letter circle only when meera.png itself is missing', () => {
    manifest.files = [];
    const { container } = render(<Meera pose="namaste" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-meera-source="letter"]')).not.toBeNull();
  });

  it('shows a plain-background picture in the soft framed style and has no float without motion', () => {
    manifest.files = ['meera/meera-wave.webp'];
    const { container } = render(<Meera pose="wave" />);
    // jsdom cannot read pixels, so the picture counts as a cut-out until measured; the CSS below
    // stops the float for people who ask for reduced motion.
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(container.querySelector('img')!.className).toContain('meera-float');
    expect(css).toMatch(/\.meera-float/);
    expect(reduced).toMatch(/\.meera-float/);
  });
});

describe('each chapter and moment maps to its pose', () => {
  it('maps the seven chapters and the finale', () => {
    const poses = Object.fromEntries(customerTour.steps.map((s) => [s.id, s.pose]));
    expect(poses).toEqual({
      welcome: 'namaste',
      book: 'scissors',
      approval: 'waiting',
      chat: 'chat',
      pay: 'wallet',
      rate: 'stars',
      safe: 'shield',
    });
    expect(customerTour.steps[0]!.restartPose).toBe('wave');
    expect(customerTour.finale?.pose).toBe('celebrate');
  });
});

describe('page tips use their own pose', () => {
  const host: TourValue = {
    available: true,
    ready: true,
    busy: false,
    definition: customerTour,
    start: () => undefined,
    isDismissed: () => false,
    dismissTip: () => undefined,
  };
  const tip = (props: { id: string; pose?: (typeof MEERA_POSES)[number] }) =>
    render(
      <TourContext.Provider value={host}>
        <PageTip id={props.id} pose={props.pose} title="Title">
          Words.
        </PageTip>
      </TourContext.Provider>,
    );

  it.each([
    ['booking', 'phone'],
    ['my-bookings', 'calendar'],
    ['packages', 'package'],
    ['memberships', 'package'],
    ['gift-cards', 'gift'],
    ['chat', 'chat'],
    ['trusted-devices', 'shield'],
  ] as const)('the %s tip shows meera-%s', (id, pose) => {
    manifest.files = everyPose();
    const { container } = tip({ id, pose });
    expect(container.querySelector('[data-page-tip]')).toHaveAttribute('data-tip-pose', pose);
    expect(container.querySelector(`[data-meera="${pose}"] img`)).toHaveAttribute('alt', '');
  });

  it('a generic "look here" tip uses meera-point', () => {
    manifest.files = everyPose();
    const { container } = tip({ id: 'anything' });
    expect(container.querySelector('[data-meera="point"]')).not.toBeNull();
  });

  it('a tip shows only its words when no picture exists', () => {
    manifest.files = [];
    const { container } = tip({ id: 'x', pose: 'gift' });
    expect(container.querySelector('[data-meera]')).toBeNull();
    expect(screen.getByText('Words.')).toBeInTheDocument();
  });
});

describe('the page-tip and moment sources use these poses', () => {
  it.each([
    ['BookPage', bookPage, 'id="booking" pose="phone"'],
    ['AppointmentsPage', appointmentsPage, 'id="my-bookings" pose="calendar"'],
    ['MyPackagesPage', packagesPage, 'id="packages" pose="package"'],
    ['MembershipsPage', membershipsPage, 'id="memberships" pose="package"'],
    ['WalletPage', walletPage, 'id="gift-cards" pose="gift"'],
    ['ChatPage', chatPage, 'id="chat" pose="chat"'],
    ['ProfilePage', profilePage, 'id="trusted-devices" pose="shield"'],
  ])('%s has %s', (_name, source, snippet) => {
    expect(source).toContain(snippet);
  });
});
