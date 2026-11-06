import type { Role } from '../../policy/policy';
import type { TourDefinition } from './types';

/**
 * One data file per role. `targets` are `data-tour` attributes on real controls; a step whose
 * controls are not on screen is skipped. Every line of Meera's speech is checked against the real
 * feature it describes (see docs/PROGRESS.md, Task 17E) and is 12 to 18 words long.
 */
export const customerTour: TourDefinition = {
  id: 'customer',
  steps: [
    {
      id: 'welcome',
      targets: ['brand', 'menu', 'menu-button'],
      title: 'Welcome to the salon door',
      speech:
        'Welcome to Alankar, {name}! This is your salon door: the logo, and the menu that holds everything.',
      pose: 'namaste',
      restartPose: 'wave',
    },
    {
      id: 'book',
      targets: ['nav-book'],
      menu: true,
      title: 'Pick a service',
      speech:
        'Pick a service under Book, {name}, then choose a time and stylist, and send your request.',
      pose: 'scissors',
    },
    {
      id: 'approval',
      targets: ['nav-appointments'],
      menu: true,
      title: 'Waiting for the nod',
      speech:
        'Your request waits for a nod, {name}: the receptionist and your stylist must both accept.',
      pose: 'waiting',
    },
    {
      id: 'chat',
      targets: ['nav-chat'],
      menu: true,
      title: 'Private chat with your stylist',
      speech:
        'Once your visit is scheduled, chat privately with your stylist, {name}, and share a style photo.',
      pose: 'chat',
    },
    {
      id: 'pay',
      targets: ['nav-packages', 'nav-wallet'],
      menu: true,
      title: 'Pay and save',
      speech:
        'Pay and save, {name}: packages and memberships, plus gift cards and your wallet, all live here.',
      pose: 'wallet',
    },
    {
      id: 'rate',
      targets: ['nav-appointments'],
      menu: true,
      title: 'Visit and rate',
      speech:
        'After your visit, {name}, rating your stylist is required and, once sent, cannot be changed.',
      pose: 'stars',
    },
    {
      id: 'safe',
      targets: ['account-trusted-devices', 'account-your-data'],
      menu: true,
      title: 'Stay safe',
      speech:
        'Stay safe, {name}: review your trusted devices and privacy choices anytime under Account.',
      pose: 'shield',
    },
  ],
  finale: {
    title: 'That is the tour',
    speech: 'You are all set, {name}! Shall we book your first visit together?',
    pose: 'celebrate',
    action: { label: 'Book your first visit', to: '/customer/book' },
  },
};

const tours: Partial<Record<Role, TourDefinition>> = { customer: customerTour };

export function tourFor(role: Role): TourDefinition | undefined {
  return tours[role];
}

export const tourKey = (id: string): string => `tour:${id}`;
export const tipKey = (id: string): string => `tip:${id}`;

/** Meera's line for a person: `{name}` becomes the first name (or nothing if unknown). */
export function speak(template: string, name: string): string {
  return (
    name ? template.replaceAll('{name}', name) : template.replace(/,?\s*\{name\}/g, '')
  ).trim();
}
