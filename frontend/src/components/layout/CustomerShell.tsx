import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { menuFor } from '../../policy/policy';
import { PageContainer } from './PageContainer';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'shrink-0 whitespace-nowrap rounded-full px-md py-sm text-sm font-medium transition-colors duration-base ease-brand',
    'focus-visible:shadow-focus focus-visible:outline-none',
    isActive ? 'bg-primary text-on-primary' : 'text-text hover:bg-primary-soft',
  );

/** Customer account pages sit inside the public site, with the customer menu from the policy. */
export function CustomerShell() {
  return (
    <PageContainer className="pt-lg">
      <nav aria-label="Customer menu" className="glass-bar rounded-card p-1">
        <ul className="flex gap-1 overflow-x-auto">
          {menuFor('customer').map((item) => (
            <li key={item.id} className="shrink-0">
              <NavLink to={item.path} className={tabClass} end>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </PageContainer>
  );
}
