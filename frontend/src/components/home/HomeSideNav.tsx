import type { HomeChapter } from '../../design/art';
import { HOME_SECTIONS, useJumpToSection } from '../../hooks/useHomeChapter';
import { cn } from '../../lib/cn';

/**
 * The small indicator at the right edge of the home page: one dot and label per section (Alankar,
 * Salon, Spa, Parlor). The active one is marked with aria-current; clicking or pressing Enter or
 * Space on a dot scrolls to that section. Sticky inside the home zone, so it leaves with it.
 */
export function HomeSideNav({ chapter }: { chapter: HomeChapter }) {
  const jump = useJumpToSection();
  return (
    <div className="pointer-events-none sticky top-0 z-20 -mb-[100svh] h-[100svh] w-full">
      <nav
        aria-label="Home sections"
        data-home-nav
        className="glass-photo pointer-events-auto absolute right-sm top-1/2 -translate-y-1/2 rounded-card px-sm py-md sm:right-md"
      >
        <ol className="flex flex-col gap-sm">
          {HOME_SECTIONS.map((section) => {
            const active = section.chapter === chapter;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  aria-label={section.label}
                  onClick={() => jump(section.id)}
                  className="group flex min-h-8 w-full items-center justify-end gap-sm rounded-full px-1 text-sm text-text focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'hidden lg:inline',
                      active ? 'font-semibold' : 'opacity-90 group-hover:opacity-100',
                    )}
                  >
                    {section.label}
                  </span>
                  <span
                    aria-hidden="true"
                    data-dot={active ? 'active' : 'idle'}
                    className={cn(
                      'block h-3 w-3 shrink-0 rounded-full border-2 border-primary transition-transform duration-base',
                      active ? 'scale-125 bg-primary' : 'bg-transparent',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
