import { divisions } from '../../config/divisions';

/** Public pages whose hero photo starts at the very top, under the floating navbar. */
export function hasHero(pathname: string): boolean {
  return pathname === '/' || divisions.some((d) => d.path === pathname);
}
