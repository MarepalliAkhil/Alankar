import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, ...rest },
  ref,
) {
  const autoId = useId();
  const boxId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          id={boxId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${boxId}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-input border-border accent-primary focus-visible:shadow-focus focus-visible:outline-none"
          {...rest}
        />
        <label htmlFor={boxId} className="cursor-pointer text-sm text-text">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${boxId}-error`} className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
});
