import { useLayoutEffect, type RefObject } from 'react';

export interface Box {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  /** A CSS transform string, e.g. from drag and drop. Empty clears it. */
  transform?: string;
}

/**
 * Sets pixel positions that are computed at runtime (a visit's place on the day board comes
 * from the clock). Tailwind classes cannot express these, and JSX `style` is banned, so the
 * element is positioned from code. Use only for such computed geometry, never for design.
 */
export function useBox(ref: RefObject<HTMLElement | null>, box: Box): void {
  const { top, left, width, height, transform } = box;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (top !== undefined) el.style.top = `${top}px`;
    if (left !== undefined) el.style.left = `${left}px`;
    if (width !== undefined) el.style.width = `${width}px`;
    if (height !== undefined) el.style.height = `${height}px`;
    el.style.transform = transform ?? '';
  }, [ref, top, left, width, height, transform]);
}
