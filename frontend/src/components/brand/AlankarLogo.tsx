import { LOGO_DETAIL, LOGO_OUTLINE, LOGO_VIEWBOX, type LogoPath } from './alankar-logo-paths';

const at = (p: LogoPath) => `translate(${p.x},${p.y})`;

/** The letter shapes (used by the splash outline layer). */
export function LogoOutlinePaths() {
  return (
    <>
      {LOGO_OUTLINE.map((p) => (
        <path key={`${p.x},${p.y}`} d={p.d} transform={at(p)} />
      ))}
    </>
  );
}

/** Every teal shape of the mark, filled. */
export function LogoFillPaths() {
  return (
    <>
      {[...LOGO_OUTLINE, ...LOGO_DETAIL].map((p, i) => (
        <path key={i} d={p.d} transform={at(p)} />
      ))}
    </>
  );
}

/**
 * The Alankar "A" monogram, drawn inline in `currentColor` so it follows the light and dark
 * themes. Decorative by default (the link or text next to it carries the name).
 */
export function AlankarLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={className}
      fill="currentColor"
      focusable="false"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <LogoFillPaths />
    </svg>
  );
}
