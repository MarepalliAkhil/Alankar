import type { ReactNode } from 'react';

/** The overview hero: the page's normal glass surface (no theme-coloured glow behind it). */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="glass relative isolate overflow-hidden rounded-card">
      <div className="relative flex flex-col gap-md p-5 sm:p-xl">{children}</div>
    </section>
  );
}
