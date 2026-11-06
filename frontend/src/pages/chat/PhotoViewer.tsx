import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '../../components/ui';
import { useDialog } from '../../hooks/useDialog';

const ZOOMS = [
  { label: 'Fit to screen', image: 'max-h-full max-w-full' },
  { label: '150%', image: 'w-[150%] max-w-none' },
  { label: '200%', image: 'w-[200%] max-w-none' },
  { label: '300%', image: 'w-[300%] max-w-none' },
] as const;

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Full-screen viewer: zoom with the buttons or + / - / 0, scroll with the arrow keys, Escape or
 *  the close button to leave (focus goes back to the thumbnail). */
export function PhotoViewer({ src, alt, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);
  const [failed, setFailed] = useState(false);
  useDialog(true, onClose, panel);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
      else if (event.key === '-' || event.key === '_') setZoom((z) => Math.max(0, z - 1));
      else if (event.key === '0') setZoom(0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-overlay flex flex-col bg-surface">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Photo viewer"
        tabIndex={-1}
        className="flex h-full flex-col focus:outline-none"
      >
        <div className="glass-bar flex items-center justify-between gap-sm px-md py-sm">
          <p className="text-sm text-text" aria-live="polite">
            Zoom: {ZOOMS[zoom].label}
          </p>
          <div className="flex items-center gap-xs">
            <IconButton
              label="Zoom out"
              icon={<Minus className="h-5 w-5" />}
              disabled={zoom === 0}
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
            />
            <IconButton
              label="Zoom in"
              icon={<Plus className="h-5 w-5" />}
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            />
            <IconButton
              label="Fit to screen"
              icon={<RotateCcw className="h-5 w-5" />}
              disabled={zoom === 0}
              onClick={() => setZoom(0)}
            />
            <IconButton label="Close photo" icon={<X className="h-5 w-5" />} onClick={onClose} />
          </div>
        </div>
        <div
          tabIndex={0}
          aria-label="Photo, scroll to move around when zoomed"
          className={
            zoom === 0
              ? 'flex min-h-0 flex-1 items-center justify-center p-md'
              : 'min-h-0 flex-1 overflow-auto p-md'
          }
        >
          {failed ? (
            <p role="alert" className="text-sm text-text">
              This photo is not available any more.
            </p>
          ) : (
            <img
              src={src}
              alt={alt}
              onError={() => setFailed(true)}
              className={`${ZOOMS[zoom].image} rounded-nested object-contain`}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
