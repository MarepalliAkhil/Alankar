import type { ReactNode } from 'react';
import { ThemeScope } from '../../design/ThemeProvider';
import type { ThemeName } from '../../design/themes';

const THEMES: ThemeName[] = ['salon', 'spa', 'parlor'];

/** A glass panel whose colour glow morphs slowly through the salon, spa and parlor themes. */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="glass relative isolate overflow-hidden rounded-card">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {THEMES.map((theme, i) => (
          <ThemeScope key={theme} theme={theme} className="absolute inset-0">
            <div data-i={i} className="zen-morph-layer" />
          </ThemeScope>
        ))}
      </div>
      <div className="relative flex flex-col gap-md p-5 sm:p-xl">{children}</div>
    </section>
  );
}
