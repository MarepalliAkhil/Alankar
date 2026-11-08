import { Link } from 'react-router-dom';
import { brand } from '../../config/brand';
import { logoHomeFor } from '../../config/logoHome';
import { useIntroPhase } from '../../intro/introPhase';
import { cn } from '../../lib/cn';
import { useSession } from '../../session/session-context';
import { AlankarLogo } from './AlankarLogo';
import './brand.css';

/**
 * The logo as the home button: the A mark and the wordmark (from the brand config, so a rename is
 * one line). Its accessible name starts with the visible text ("Alankar home"). It is a real link
 * with a visible focus ring and a 44 px target. In the navbar, while the splash is up, the mark is
 * hidden in its reserved place (no layout shift) and the wordmark slides out once the logo lands.
 */
export function BrandLink({
  placement,
  collapsed = false,
  onNavigate,
}: {
  placement: 'navbar' | 'sidebar';
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { user } = useSession();
  const phase = useIntroPhase();
  const to = logoHomeFor(user);
  const name = `${brand.logoText} home`;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      data-tour={placement === 'sidebar' ? 'brand' : undefined}
      data-brand-link={placement}
      data-intro={placement === 'navbar' && phase === 'splash' ? 'splash' : 'shown'}
      aria-label={collapsed ? name : undefined}
      className={cn(
        'brand-link inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-1.5 text-text focus-visible:shadow-focus focus-visible:outline-none',
        collapsed && 'justify-center',
      )}
    >
      <span
        data-brand-mark={placement}
        className={cn(
          'brand-mark inline-flex shrink-0 text-primary-hover',
          placement === 'navbar' ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8',
        )}
      >
        <AlankarLogo className="h-full w-full" />
      </span>
      {!collapsed && (
        <span className="brand-word text-lg font-semibold leading-7 sm:text-xl">
          {brand.logoText}
          <span className="sr-only"> home</span>
        </span>
      )}
    </Link>
  );
}
