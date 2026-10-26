import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog';
import { IconButton } from './IconButton';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Side sheet from the right (full width on phones). */
export function Drawer({ open, onClose, title, description, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialog(open, onClose, panelRef);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-overlay flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="glass-dense relative flex h-full w-full max-w-md flex-col rounded-l-modal shadow-raised focus:outline-none"
      >
        <div className="flex items-start justify-between gap-md p-lg pb-md">
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
          <IconButton label="Close panel" icon={<X className="h-5 w-5" />} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-lg pb-lg">{children}</div>
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
