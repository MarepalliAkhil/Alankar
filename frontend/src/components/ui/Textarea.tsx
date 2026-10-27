import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { controlClasses, describedBy } from './control-styles';
import { Field } from './Field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, required, className, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={controlClasses(Boolean(error), `py-2 ${className ?? ''}`).replace('h-11 ', '')}
        {...rest}
      />
    </Field>
  );
});
