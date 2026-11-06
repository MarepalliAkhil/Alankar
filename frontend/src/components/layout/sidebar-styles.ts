import { cn } from '../../lib/cn';

/**
 * The ONE look of a navigation item, shared by the sidebar and the public navbar: same height,
 * type, hover, focus and active state (a soft pill with a thin ring).
 */
export const navItemClass = (active = false, extra = '') =>
  cn(
    'group relative inline-flex h-10 items-center gap-sm whitespace-nowrap rounded-full text-base font-medium transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    active
      ? 'bg-primary-soft text-primary-hover ring-1 ring-primary-light'
      : 'text-text hover:bg-primary-soft',
    extra,
  );

/** One shape for every row in the sidebar (menu links, Account actions): same height, same states. */
export const rowClass = (collapsed: boolean, active = false) =>
  navItemClass(active, collapsed ? 'w-10 justify-center' : 'flex w-full px-md');

/** The panel a row opens (notifications, appearance): beside the sidebar, or inline in the drawer. */
export const panelPlacement = (placement: 'side' | 'inline') =>
  placement === 'side'
    ? 'glass-panel absolute bottom-0 left-full z-overlay ml-sm'
    : 'glass-panel relative mt-sm';
