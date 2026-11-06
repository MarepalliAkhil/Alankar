import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import { controlClasses, describedBy } from './control-styles';
import { Field } from './Field';
import type { InputProps } from './Input';

export type PasswordInputProps = Omit<InputProps, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, hint, error, id, required, className, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);
    return (
      <Field id={inputId} label={label} hint={hint} error={error} required={required}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(inputId, hint, error)}
            className={controlClasses(Boolean(error), `pr-12 ${className ?? ''}`)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-1 my-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      </Field>
    );
  },
);
