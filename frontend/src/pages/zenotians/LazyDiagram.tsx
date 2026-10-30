import { lazy, Suspense, type ComponentType } from 'react';
import { Skeleton } from '../../components/ui/Skeleton';

/** Diagrams load on demand; the placeholder reserves their height so nothing jumps. */
function lazyDiagram<P extends object>(
  load: () => Promise<ComponentType<P>>,
  reserve: string,
): ComponentType<P> {
  const Inner = lazy(async () => ({ default: await load() })) as unknown as ComponentType<P>;
  return function Wrapped(props: P) {
    return (
      <Suspense fallback={<Skeleton className={reserve} />}>
        <Inner {...props} />
      </Suspense>
    );
  };
}

export const LazyRolesDiagram = lazyDiagram(
  async () => (await import('./diagrams')).RolesDiagram,
  'h-[22rem]',
);
export const LazyLifecycleDiagram = lazyDiagram(
  async () => (await import('./diagrams')).LifecycleDiagram,
  'h-[22rem]',
);
export const LazyFlowDiagram = lazyDiagram(
  async () => (await import('./diagrams')).FlowDiagram,
  'h-48',
);
export const LazyVisionOverviewDiagram = lazyDiagram(
  async () => (await import('./diagrams')).VisionOverviewDiagram,
  'h-[22rem]',
);
