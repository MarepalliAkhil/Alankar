import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog';
import { cn } from '../../lib/cn';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialog(open, onClose, panelRef);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-overlay flex items-end justify-center p-md sm:items-center">
      <div aria-hidden="true" className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'glass-dense sheet-up relative flex max-h-[90vh] w-full flex-col rounded-modal shadow-raised focus:outline-none',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-md p-lg pb-0">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-text">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" icon={<X className="h-5 w-5" />} onClick={onClose} />
        </div>
        <div className="overflow-y-auto p-lg">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-sm border-t border-border px-lg py-md">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
