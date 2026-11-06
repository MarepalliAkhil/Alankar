import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { IconButton } from './IconButton';
import { ToastContext, type ToastInput, type ToastTone } from './toast-context';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const toneStyles: Record<ToastTone, { accent: string; icon: ReactNode }> = {
  info: { accent: 'border-l-info', icon: <Info className="h-5 w-5 text-info-text" /> },
  success: {
    accent: 'border-l-success',
    icon: <CircleCheck className="h-5 w-5 text-success-text" />,
  },
  warning: {
    accent: 'border-l-warning',
    icon: <TriangleAlert className="h-5 w-5 text-warning-text" />,
  },
  danger: { accent: 'border-l-danger', icon: <CircleX className="h-5 w-5 text-danger-text" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    ({ title, description, tone = 'info', durationMs = 4500 }: ToastInput) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, title, description, tone }].slice(-4));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-sm p-md sm:items-end"
        >
          {items.map((item) => (
            <div
              key={item.id}
              role={item.tone === 'danger' ? 'alert' : 'status'}
              className={cn(
                'glass-dense pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-nested border-l-4 p-md',
                toneStyles[item.tone].accent,
              )}
            >
              <span aria-hidden="true" className="mt-0.5 inline-flex">
                {toneStyles[item.tone].icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-sm text-text-muted">{item.description}</p>
                )}
              </div>
              <IconButton
                label="Dismiss notification"
                icon={<X className="h-4 w-4" />}
                className="-mr-2 -mt-2"
                onClick={() => dismiss(item.id)}
              />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
