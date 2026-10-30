import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';
import { controlClasses, describedBy } from './control-styles';
import { Field } from './Field';

/**
 * Task 11 glass components. Every value (fill, tint, blur, border, shadow, grain) is a theme
 * token, so they follow the page theme and dark/light mode. With "reduce transparency" (the
 * system setting or the visitor's own toggle) each one becomes a solid surface with no blur.
 */

type Tag = 'div' | 'section' | 'article' | 'li' | 'aside' | 'header' | 'footer';

const paddings = { none: '', sm: 'p-md', md: 'p-lg', lg: 'p-lg sm:p-xl' };

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: Tag;
  padding?: keyof typeof paddings;
  /** Lift slightly on hover (only transform and shadow, for clickable cards). */
  interactive?: boolean;
}

/** A frosted card: light glass for content over artwork. */
export function GlassCard({
  as: Element = 'div',
  padding = 'md',
  interactive = false,
  className,
  ...rest
}: GlassCardProps) {
  return (
    <Element
      className={cn(
        'glass-card rounded-card',
        paddings[padding],
        interactive &&
          'transition-transform duration-base ease-brand hover:-translate-y-0.5 focus-within:-translate-y-0.5',
        className,
      )}
      {...rest}
    />
  );
}

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: Tag;
  padding?: keyof typeof paddings;
}

/** Denser, less transparent glass for tables, forms and dense data. */
export function GlassPanel({
  as: Element = 'div',
  padding = 'md',
  className,
  ...rest
}: GlassPanelProps) {
  return (
    <Element className={cn('glass-panel rounded-card', paddings[padding], className)} {...rest} />
  );
}

export interface GlassNavProps extends HTMLAttributes<HTMLElement> {
  /** Accessible name, e.g. "Main". */
  label: string;
}

/** A glass navigation bar (stronger blur so busy artwork behind it stays calm). */
export function GlassNav({ label, className, ...rest }: GlassNavProps) {
  return <nav aria-label={label} className={cn('glass-nav rounded-card', className)} {...rest} />;
}

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
}

/** A secondary action on glass (the primary action stays the solid Button). */
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'glass-button inline-flex select-none items-center justify-center gap-2 rounded-full font-medium text-text',
        'transition-transform duration-base ease-brand hover:-translate-y-px active:translate-y-0',
        'focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-9 px-4 text-sm' : 'h-11 px-5 text-sm',
        className,
      )}
      {...rest}
    />
  );
});

export interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** A text input on glass, with the same label, hint and error handling as Input. */
export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(function GlassInput(
  { label, hint, error, id, required, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClasses(Boolean(error)), 'glass-input', className)}
        {...rest}
      />
    </Field>
  );
});

/**
 * GlassModal and GlassDrawer: the existing Modal and Drawer, which are built on dense glass
 * (solid with "reduce transparency"), with a short rise / slide-in entrance that is instant with
 * reduced motion. Same props, same focus trap and Escape handling as Modal and Drawer.
 */
export { Modal as GlassModal, type ModalProps as GlassModalProps } from './Modal';
export { Drawer as GlassDrawer, type DrawerProps as GlassDrawerProps } from './Drawer';
