import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useZenotians } from './context';
import { ROOT, type SectionId } from './model';

/** Guard for a sub-route: a section that is hidden (no content) sends the visitor to the overview. */
export function SectionGate({ id, children }: { id: SectionId; children: ReactNode }) {
  const { menu } = useZenotians();
  return menu.some((entry) => entry.id === id) ? <>{children}</> : <Navigate to={ROOT} replace />;
}
