import {
  ChevronsLeft,
  ChevronsRight,
  Compass,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { brand } from '../../config/brand';
import { cn } from '../../lib/cn';
import { menuGroupsFor, profilePathFor, type Role } from '../../policy/policy';
import { CommandRow } from '../ui/CommandBar';
import { DisplaySettings } from '../ui/DisplaySettings';
import { IconButton } from '../ui/IconButton';
import { MenuIcon } from './menu-icons';
import { AppearanceSwitch } from './AppearanceSwitch';
import { ProfileMenu } from './ProfileMenu';
import { useTour } from '../tour/tour-context';
import { Tip } from './SidebarParts';
import { rowClass } from './sidebar-styles';

interface SidebarProps {
  role: Role;
  collapsed: boolean;
  /** Beside the page (desktop) or inside the phone drawer. */
  placement: 'side' | 'inline';
  onToggle?: () => void;
  onNavigate?: () => void;
}

/** Customers keep their privacy and device settings on the profile page: these two rows jump there. */
const CUSTOMER_ACCOUNT_LINKS = [
  { id: 'trusted-devices', label: 'Trusted devices', Icon: MonitorSmartphone },
  { id: 'your-data', label: 'Privacy & data', Icon: ShieldCheck },
] as const;

/**
 * The ONE navigation of the signed-in area (all four roles): logo, the role's menu from
 * shared/policy.json under small headings, an Account group, and the profile button.
 */
export function Sidebar({ role, collapsed, placement, onToggle, onNavigate }: SidebarProps) {
  const groups = menuGroupsFor(role);
  const tour = useTour();
  return (
    <div className="flex h-full min-h-0 flex-col gap-md">
      <div className={cn('flex items-center gap-sm', collapsed ? 'flex-col' : 'justify-between')}>
        <Link
          to="/"
          data-tour="brand"
          onClick={onNavigate}
          aria-label={collapsed ? `${brand.shopName}, home page` : undefined}
          className="min-w-0 rounded-full px-2 py-1 focus-visible:shadow-focus focus-visible:outline-none"
        >
          <span className="block truncate text-xl font-semibold text-text">
            {collapsed ? brand.logoText.slice(0, 1) : brand.logoText}
          </span>
          {!collapsed && (
            <span className="block truncate text-xs text-text-muted">{brand.shopTagline}</span>
          )}
        </Link>
        {onToggle && (
          <IconButton
            label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            icon={
              collapsed ? (
                <ChevronsRight className="h-5 w-5" />
              ) : (
                <ChevronsLeft className="h-5 w-5" />
              )
            }
            onClick={onToggle}
          />
        )}
      </div>

      <nav aria-label="Main menu" data-tour="menu" className="flex min-h-0 flex-1 flex-col gap-sm">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ul className={cn('mb-md flex flex-col gap-1', collapsed && 'items-center')}>
            <li className={collapsed ? undefined : 'w-full'}>
              <CommandRow collapsed={collapsed} />
            </li>
          </ul>
          {groups.map((group) => (
            <MenuSection
              key={group.heading}
              id={group.heading}
              heading={group.heading}
              collapsed={collapsed}
            >
              {group.items.map((item) => (
                <li key={item.id} className={collapsed ? undefined : 'w-full'}>
                  <NavLink
                    to={item.path}
                    end
                    data-tour={`nav-${item.id}`}
                    onClick={onNavigate}
                    className={({ isActive }) => rowClass(collapsed, isActive)}
                  >
                    <MenuIcon id={item.id} className="h-5 w-5 shrink-0" />
                    <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
                    {collapsed && <Tip>{item.label}</Tip>}
                  </NavLink>
                </li>
              ))}
            </MenuSection>
          ))}
          <MenuSection id="account" heading="Account" collapsed={collapsed}>
            <li className={collapsed ? undefined : 'w-full'}>
              <NavLink
                to={profilePathFor(role)}
                end
                data-tour="nav-profile"
                onClick={onNavigate}
                className={({ isActive }) => rowClass(collapsed, isActive)}
              >
                <UserRound aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className={collapsed ? 'sr-only' : 'truncate'}>Profile</span>
                {collapsed && <Tip>Profile</Tip>}
              </NavLink>
            </li>
            {role === 'customer' &&
              CUSTOMER_ACCOUNT_LINKS.map(({ id, label, Icon }) => (
                <li key={id} className={collapsed ? undefined : 'w-full'}>
                  <Link
                    to={{ pathname: '/customer/profile', hash: id }}
                    data-tour={`account-${id}`}
                    onClick={onNavigate}
                    className={rowClass(collapsed)}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
                    {collapsed && <Tip>{label}</Tip>}
                  </Link>
                </li>
              ))}
          </MenuSection>
          <MenuSection id="help" heading="Help and display" collapsed={collapsed}>
            <li className={collapsed ? undefined : 'w-full'}>
              {collapsed ? (
                <DisplaySettings row collapsed placement={placement} />
              ) : (
                <AppearanceSwitch />
              )}
            </li>
            {role === 'customer' && tour?.available && (
              <li className={collapsed ? undefined : 'w-full'}>
                <button
                  type="button"
                  data-tour="take-tour"
                  onClick={tour.start}
                  className={rowClass(collapsed)}
                >
                  <Compass aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className={collapsed ? 'sr-only' : 'truncate'}>Take the tour</span>
                  {collapsed && <Tip>Take the tour</Tip>}
                </button>
              </li>
            )}
          </MenuSection>
        </div>
      </nav>

      <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
    </div>
  );
}

/** One menu group: a small heading (a divider and a hidden heading when collapsed) and its rows. */
function MenuSection({
  id,
  heading,
  collapsed,
  children,
}: {
  id: string;
  heading: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  const headingId = `nav-${id}`;
  return (
    <section aria-labelledby={headingId} className="mb-md last:mb-0">
      {collapsed && <hr className="mx-auto mb-sm w-6 border-border" aria-hidden="true" />}
      <h2
        id={headingId}
        className={
          collapsed
            ? 'sr-only'
            : 'px-md pb-1 text-xs font-semibold uppercase tracking-wide text-text'
        }
      >
        {heading}
      </h2>
      <ul className={cn('flex flex-col gap-1', collapsed && 'items-center')}>{children}</ul>
    </section>
  );
}
